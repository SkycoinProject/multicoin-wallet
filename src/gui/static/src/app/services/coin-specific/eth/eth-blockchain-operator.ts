import { Subscription, of, Observable, ReplaySubject } from 'rxjs';
import { delay, map, mergeMap, filter, first } from 'rxjs/operators';
import { NgZone, Injector } from '@angular/core';
import BigNumber from 'bignumber.js';

import { Coin } from '../../../coins/coin';
import { ProgressEvent, BlockchainState } from '../../blockchain.service';
import { BlockchainOperator } from '../blockchain-operator';
import { BalanceAndOutputsOperator } from '../balance-and-outputs-operator';
import { OperatorService } from '../../operators.service';
import { EthApiService } from '../../api/eth-api.service';
import { BlockbookApiService } from '../../api/blockbook-api.service';

/**
 * Operator for BlockchainService to be used with eth-like coins.
 *
 * You can find more information about the functions and properties this class implements by
 * checking BlockchainService and BlockchainOperator.
 */
export class EthBlockchainOperator implements BlockchainOperator {
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
  private ethApiService: EthApiService;
  private ngZone: NgZone;
  private balanceAndOutputsOperator: BalanceAndOutputsOperator;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.blockbookApiService = injector.get(BlockbookApiService);
    this.ethApiService = injector.get(EthApiService);
    this.ngZone = injector.get(NgZone);

    // Intervals for updating the data must be longer if connecting to a remote node.
    if (!currentCoin.isLocal) {
      this.updatePeriod = 120 * 1000;
      this.errorUpdatePeriod = 30 * 1000;
    }

    // Get the operators and only then start using them.
    this.operatorsSubscription = injector.get(OperatorService).currentOperators.pipe(filter(operators => !!operators), first()).subscribe(operators => {
      this.balanceAndOutputsOperator = operators.balanceAndOutputsOperator;

      // Start checking the state of the blockchain.
      this.startDataRefreshSubscription(0);
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
    // Get the last block info.
    return this.ethApiService.callRpcMethod(this.currentCoin.nodeUrl, 'eth_getBlockByNumber', ['latest', false]).pipe(map(result => {
      return {
        lastBlock: {
          seq: new BigNumber((result.number as string).substr(2), 16).toNumber(),
          timestamp: new BigNumber((result.timestamp as string).substr(2), 16).toNumber(),
          hash: result.hash,
        },
        coinSupply: null,
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

    let blockbookData: any;

    this.ngZone.runOutsideAngular(() => {
      this.dataSubscription = of(0).pipe(
        delay(delayMs),
        mergeMap(() => {
          return this.blockbookApiService.get(this.currentCoin.indexerUrl, 'api');
        }),
        mergeMap(result => {
          blockbookData = result;

          return this.ethApiService.callRpcMethod(this.currentCoin.nodeUrl, 'eth_syncing');
        }),
      ).subscribe(result => {
        this.ngZone.run(() => {
          let synchronized = false;

          // If the result is false, the blockchain is synchronized.
          if (result === false) {
            // If Blockbook and the node are more than 1 block appart, consider everything
            // out of sync.
            if (new BigNumber(blockbookData.backend.blocks).minus(blockbookData.blockbook.bestHeight).isGreaterThan(1)) {
              this.progressSubject.next({
                currentBlock: blockbookData.blockbook.bestHeight,
                highestBlock: blockbookData.backend.blocks,
                synchronized: false,
              });
            } else {
              this.progressSubject.next({
                currentBlock: 0,
                highestBlock: 0,
                synchronized: true,
              });

              synchronized = true;
            }
          } else {
            this.progressSubject.next({
              currentBlock: new BigNumber((result.currentBlock as string).substr(2), 16).toNumber(),
              highestBlock: new BigNumber((result.highestBlock as string).substr(2), 16).toNumber(),
              synchronized: false,
            });
          }

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
