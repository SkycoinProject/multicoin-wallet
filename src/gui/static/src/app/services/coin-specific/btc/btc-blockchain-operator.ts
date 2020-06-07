import { Subscription, of, Observable, ReplaySubject } from 'rxjs';
import { delay, map, mergeMap, filter, first } from 'rxjs/operators';
import { NgZone, Injector } from '@angular/core';
import BigNumber from 'bignumber.js';

import * as moment from 'moment';

import { Coin } from '../../../coins/coin';
import { ProgressEvent, BlockchainState } from '../../blockchain.service';
import { BlockchainOperator } from '../blockchain-operator';
import { environment } from '../../../../environments/environment';
import { BtcCoinConfig } from '../../../coins/config/btc.coin-config';
import { BlockbookApiService } from '../../api/blockbook-api.service';
import { BalanceAndOutputsOperator } from '../balance-and-outputs-operator';
import { OperatorService } from '../../operators.service';

/**
 * Operator for BlockchainService to be used with btc-like coins..
 *
 * You can find more information about the functions and properties this class implements by
 * checking BlockchainService and BlockchainOperator.
 */
export class BtcBlockchainOperator implements BlockchainOperator {
  private progressSubject: ReplaySubject<ProgressEvent> = new ReplaySubject<ProgressEvent>(1);

  private dataSubscription: Subscription;
  private operatorsSubscription: Subscription;

  /**
   * If the node was synchronized the last time it was checked.
   */
  private nodeSynchronized = false;

  /**
   * Time interval in which periodic data updates will be made.
   */
  private updatePeriod = 2 * 1000;
  /**
   * Time interval in which the periodic data updates will be restarted after an error.
   */
  private errorUpdatePeriod = 2 * 1000;

  get progress(): Observable<ProgressEvent> {
    return this.progressSubject.asObservable();
  }

  // Coin the current instance will work with.
  private currentCoin: Coin;

  // Services and operators used by this operator.
  private blockbookApiService: BlockbookApiService;
  private ngZone: NgZone;
  private balanceAndOutputsOperator: BalanceAndOutputsOperator;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.blockbookApiService = injector.get(BlockbookApiService);
    this.ngZone = injector.get(NgZone);

    // Intervals for updating the data must be longer if connecting to a remote backend.
    if (!currentCoin.isLocal) {
      this.updatePeriod = 120 * 1000;
      this.errorUpdatePeriod = 30 * 1000;
    }

    this.currentCoin = currentCoin;

    // Get the operators and only then start using them.
    this.operatorsSubscription = injector.get(OperatorService).currentOperators.pipe(filter(operators => !!operators), first()).subscribe(operators => {
      this.balanceAndOutputsOperator = operators.balanceAndOutputsOperator;

      // Start checking the state of the blockchain.
      this.startDataRefreshSubscription(0);
    });
  }

  dispose() {
    this.operatorsSubscription.unsubscribe();
    if (this.dataSubscription) {
      this.dataSubscription.unsubscribe();
    }

    this.progressSubject.complete();
  }

  getBlockchainState(): Observable<BlockchainState> {
    // Get the basic info from Blockbook.
    return this.blockbookApiService.get(this.currentCoin.indexerUrl, 'api').pipe(map(result => {
      let currentBlock = result.blockbook.bestHeight;
      let currentSupply = new BigNumber(0);
      let reward = new BigNumber((this.currentCoin.config as BtcCoinConfig).initialMiningReward);

      // Calculate how many coins have been mined.
      while (currentBlock > 0) {
        if (currentBlock < (this.currentCoin.config as BtcCoinConfig).halvingBlocks) {
          currentSupply = currentSupply.plus(reward.multipliedBy(currentBlock));
          currentBlock = 0;
        } else {
          currentSupply = currentSupply.plus(reward.multipliedBy((this.currentCoin.config as BtcCoinConfig).halvingBlocks));
          currentBlock -= (this.currentCoin.config as BtcCoinConfig).halvingBlocks;
          reward = reward.dividedBy(2);
        }
      }

      return {
        lastBlock: {
          seq: result.blockbook.bestHeight,
          timestamp: moment(result.blockbook.lastBlockTime).unix(),
          hash: result.backend.bestBlockHash,
        },
        coinSupply: {
          currentSupply: currentSupply.toString(),
          totalSupply: (this.currentCoin.config as BtcCoinConfig).totalSupply.toString(),
        },
      };
    }));
  }

  /**
   * Makes the operator start periodically checking the synchronization state of the blockchain.
   * If this function was called before, the previous procedure is cancelled.
   * @param delayMs Delay before starting to check the data.
   */
  private startDataRefreshSubscription(delayMs: number) {
    if (this.dataSubscription) {
      this.dataSubscription.unsubscribe();
    }

    this.ngZone.runOutsideAngular(() => {
      this.dataSubscription = of(0).pipe(
        delay(delayMs),
        mergeMap(() => {
          return this.blockbookApiService.get(this.currentCoin.indexerUrl, 'api');
        }),
      ).subscribe(result => {
        this.ngZone.run(() => {
          // Consider the blockchain out of sync if the last block is very old.
          let synchronized = environment.ignoreNonFiberNetworIssues ? true :
            Date.now() - (moment(result.blockbook.lastBlockTime).unix() * 1000) < (this.currentCoin.config as BtcCoinConfig).outOfSyncMinutes * 60000;

          // If Blockbook and the node are more than 1 block appart, consider everything
          // out of sync.
          if (new BigNumber(result.backend.blocks).minus(result.blockbook.bestHeight).isGreaterThan(1)) {
            synchronized = false;
          }

          this.progressSubject.next({
            currentBlock: 0,
            highestBlock: 0,
            synchronized: synchronized,
          });

          // If the node was out of sync and now it is not, refresh the balance.
          if (synchronized && !this.nodeSynchronized) {
            this.balanceAndOutputsOperator.refreshBalance();
          }

          this.nodeSynchronized = synchronized;

          this.startDataRefreshSubscription(this.updatePeriod);
        });
      }, () => {
        this.startDataRefreshSubscription(this.errorUpdatePeriod);
      });
    });
  }
}
