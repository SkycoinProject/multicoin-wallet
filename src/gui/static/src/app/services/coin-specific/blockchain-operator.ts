import { Observable } from 'rxjs';

import { ProgressEvent, BlockchainState } from '../blockchain.service';

/**
 * Interface with the elements the operators for BlockchainService must have.
 * Much of it is similar to BlockchainService, so you can find more info in that class.
 */
export interface BlockchainOperator {
  // Properties. Documented on the service.
  progress: Observable<ProgressEvent>;

  /**
   * Makes the operator close all observables and run cleaning procedures. Must be called when
   * the operator is going to be replaced.
   */
  dispose();

  // Functions related to the state of the blockchain. Documented on the service.
  getBlockchainState(): Observable<BlockchainState>;
}
