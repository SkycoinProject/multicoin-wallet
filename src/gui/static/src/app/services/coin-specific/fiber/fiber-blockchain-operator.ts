import { Subscription, of, Observable, ReplaySubject } from 'rxjs';
import { delay, map, mergeMap, filter, first } from 'rxjs/operators';
import { NgZone, Injector } from '@angular/core';

import { Coin } from '../../../coins/coin';
import { BasicBlockInfo, ProgressEvent, BlockchainState } from '../../blockchain.service';
import { BlockchainOperator } from '../blockchain-operator';
import { FiberApiService } from '../../api/fiber-api.service';
import { BalanceAndOutputsOperator } from '../balance-and-outputs-operator';
import { OperatorService } from '../../operators.service';

/**
 * Operator for BlockchainService to be used with Fiber coins.
 *
 * You can find more information about the functions and properties this class implements by
 * checking BlockchainService and BlockchainOperator.
 */
export class FiberBlockchainOperator implements BlockchainOperator {
  private progressSubject: ReplaySubject<ProgressEvent> = new ReplaySubject<ProgressEvent>(1);
  /**
   * The current block reported the last time the current synchronization state was checked.
   */
  private lastCurrentBlock = 0;
  /**
   * The last block reported the last time the current synchronization state was checked.
   */
  private lastHighestBlock = 0;
  /**
   * If the node was synchronized the last time it was checked.
   */
  private nodeSynchronized = false;
  /**
   * Allows the service to update the balance the first time the blockchain state is updated.
   */
  private refreshedBalance = false;

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
  private fiberApiService: FiberApiService;
  private ngZone: NgZone;
  private balanceAndOutputsOperator: BalanceAndOutputsOperator;

  constructor(injector: Injector, currentCoin: Coin) {
    // Get the services.
    this.fiberApiService = injector.get(FiberApiService);
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
    let lastBlock: BasicBlockInfo;

    // Get the last block info.
    return this.fiberApiService.get(this.currentCoin.nodeUrl, 'last_blocks', { num: 1 }).pipe(mergeMap(blocks => {
      lastBlock = {
        seq: blocks.blocks[0].header.seq,
        timestamp: blocks.blocks[0].header.timestamp,
        hash: blocks.blocks[0].header.block_hash,
      };

      // Get the coin supply info.
      return this.fiberApiService.get(this.currentCoin.nodeUrl, 'coinSupply');
    }), map(supply => {
      return {
        lastBlock: lastBlock,
        coinSupply: {
          currentSupply: supply.current_supply,
          totalSupply: supply.total_supply,
          currentCoinhourSupply: supply.current_coinhour_supply,
          totalCoinhourSupply: supply.total_coinhour_supply,
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
      this.dataSubscription = of(0).pipe(delay(delayMs), mergeMap(() => {
        return this.fiberApiService.get(this.currentCoin.nodeUrl, 'blockchain/progress');
      })).subscribe((response: any) => {
        this.ngZone.run(() => {
          // Stop if a value is not valid.
          if (!response || !response.current || !response.highest || response.highest === 0 || response.current < this.lastCurrentBlock || response.highest < this.lastHighestBlock) {
            this.startDataRefreshSubscription(this.errorUpdatePeriod);

            return;
          }

          this.lastCurrentBlock = response.current;
          this.lastHighestBlock = response.highest;

          if (response.current === response.highest && !this.nodeSynchronized) {
            this.nodeSynchronized = true;
            this.balanceAndOutputsOperator.refreshBalance();
            this.refreshedBalance = true;
          } else if (response.current !== response.highest && this.nodeSynchronized) {
            this.nodeSynchronized = false;
          }

          this.nodeSynchronized = this.nodeSynchronized;

          // Refresh the balance the first time the info is retrieved.
          if (!this.refreshedBalance) {
            this.balanceAndOutputsOperator.refreshBalance();
            this.refreshedBalance = true;
          }

          this.progressSubject.next({
            currentBlock: this.lastCurrentBlock,
            highestBlock: this.lastHighestBlock,
            synchronized: this.nodeSynchronized,
          });

          this.startDataRefreshSubscription(this.updatePeriod);
        });
      }, () => {
        this.startDataRefreshSubscription(this.errorUpdatePeriod);
      });
    });
  }
}
