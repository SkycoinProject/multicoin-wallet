import { Subscription, of, Observable, ReplaySubject } from 'rxjs';
import { delay, map, mergeMap } from 'rxjs/operators';
import { NgZone, Injector } from '@angular/core';

import { Coin } from '../../../coins/coin';
import { ProgressEvent, BlockchainState } from '../../blockchain.service';
import { BlockchainOperator } from '../blockchain-operator';
import { BalanceAndOutputsOperator } from '../balance-and-outputs-operator';
import { OperatorService } from '../../operators.service';
import { BtcApiService } from '../../api/btc-api.service';
import BigNumber from 'bignumber.js';
import { environment } from '../../../../environments/environment';

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
   * Time interval in which periodic data updates will be made.
   */
  private updatePeriod = 2 * 1000;
  /**
   * Time interval in which the periodic data updates will be restarted after an error.
   */
  private errorUpdatePeriod = 2 * 1000;

  /**
   * allows to know the current synchronization state of the blockchain.
   */
  get progress(): Observable<ProgressEvent> {
    return this.progressSubject.asObservable();
  }

  // Coin the current instance will work with.
  private currentCoin: Coin;

  // Services and operators used by this operator.
  private btcApiService: BtcApiService;
  private ngZone: NgZone;
  private balanceAndOutputsOperator: BalanceAndOutputsOperator;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.btcApiService = injector.get(BtcApiService);
    this.ngZone = injector.get(NgZone);

    // Intervals for updating the data must be longer if connecting to a remote node.
    if (!currentCoin.isLocal) {
      this.updatePeriod = 120 * 1000;
      this.errorUpdatePeriod = 30 * 1000;
    }

    // Get the operators and only then start using them.
    this.operatorsSubscription = injector.get(OperatorService).currentOperators.subscribe(operators => {
      if (operators) {
        this.balanceAndOutputsOperator = operators.balanceAndOutputsOperator;
        this.operatorsSubscription.unsubscribe();

        // Start checking the state of the blockchain.
        this.startDataRefreshSubscription(0);
      }
    });

    this.currentCoin = currentCoin;
  }

  dispose() {
    this.operatorsSubscription.unsubscribe();
    if (this.dataSubscription) {
      this.dataSubscription.unsubscribe();
    }

    this.progressSubject.complete();
  }

  getBlockchainState(): Observable<BlockchainState> {
    let lastBlockHash = '';

    // Get the hash of the last block.
    return this.btcApiService.callRpcMethod(this.currentCoin.nodeUrl, 'getbestblockhash').pipe(mergeMap(result => {
      lastBlockHash = result;

      // Get the info of the last block.
      return this.btcApiService.callRpcMethod(this.currentCoin.nodeUrl, 'getblock', [lastBlockHash]);
    }), map(result => {
      let currentBlock = result.height + 1;
      let currentSupply = new BigNumber(0);
      let reward = new BigNumber(50);

      // Calculate how many coins have been mined.
      while (currentBlock > 0) {
        if (currentBlock < 210000) {
          currentSupply = currentSupply.plus(reward.multipliedBy(currentBlock));
          currentBlock = 0;
        } else {
          currentSupply = currentSupply.plus(reward.multipliedBy(210000));
          currentBlock -= 210000;
          reward = reward.dividedBy(2);
        }
      }

      return {
        lastBlock: {
          seq: result.height,
          timestamp: result.time,
          hash: lastBlockHash,
        },
        coinSupply: {
          currentSupply: currentSupply.toString(),
          totalSupply: '21000000',
          currentCoinhourSupply: '0',
          totalCoinhourSupply: '0',
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
          return this.btcApiService.callRpcMethod(this.currentCoin.nodeUrl, 'getbestblockhash');
        }),
        mergeMap(result => {
          // Get the info of the last block.
          return this.btcApiService.callRpcMethod(this.currentCoin.nodeUrl, 'getblock', [result]);
        }),
      ).subscribe(result => {
        this.ngZone.run(() => {
          // Consider the blockchain out of sync if the last block is more than 90 minutes old.
          this.progressSubject.next({
            currentBlock: 0,
            highestBlock: 0,
            synchronized: environment.ignoreNonFiberNetworIssues ? true : Date.now() - (result.time + 1000) < 5400000,
          });

          this.startDataRefreshSubscription(this.updatePeriod);
        });
      }, () => {
        this.startDataRefreshSubscription(this.errorUpdatePeriod);
      });
    });
  }
}
