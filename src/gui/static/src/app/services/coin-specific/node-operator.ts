import { BigNumber } from 'bignumber.js';
import { Observable } from 'rxjs';

/**
 * Interface with the elements the operators for NodeService must have.
 * Much of it is similar to NodeService, so you can find more info in that class.
 */
export interface NodeOperator {
  // Properties. Documented on the service.
  remoteNodeDataUpdated: Observable<boolean>;
  nodeVersion: string;
  currentMaxDecimals: number;
  burnRate: BigNumber;

  /**
   * Makes the operator close all observables and run cleaning procedures. Must be called when
   * the operator is going to be replaced.
   */
  dispose();
}
