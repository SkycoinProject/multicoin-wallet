import { delay, retryWhen } from 'rxjs/operators';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { NodeOperator } from './coin-specific/node-operator';
import { FiberApiService } from './api/fiber-api.service';
import { OperatorService } from './operators.service';
import { environment } from '../../environments/environment';

/**
 * Allows to access general information about the local and remote nodes.
 */
@Injectable()
export class NodeService {
  /**
   * Instance with the actual code for making most of the operations of this service. It is
   * specific for the currently selected coin.
   */
  private operator: NodeOperator;

  /**
   * Indicates if the csrf token protection is disabled on the local node.
   */
  get localNodeCsrfDisabled() {
    return this.localNodeCsrfDisabledInternal;
  }
  private localNodeCsrfDisabledInternal = false;

  /**
   * If the data this service has about the remote node (or the local node, if the current coin
   * is managed by the local node) has been updated.
   */
  get remoteNodeDataUpdated(): Observable<boolean> {
    return this.operator.remoteNodeDataUpdated;
  }

  /**
   * Version number of the remote node.
   */
  get nodeVersion() {
    return this.operator.nodeVersion;
  }

  /**
   * Indicates the maximum number of decimals for the coin currently accepts.
   */
  get currentMaxDecimals() {
    return this.operator.currentMaxDecimals;
  }

  /**
   * Rate used for calculating the amount of hours that should be burned as transaction fee
   * when sending coins. The minimum amount to burn is "totalHours / burnRate".
   */
  get burnRate() {
    return this.operator.burnRate;
  }

  constructor(
    private fiberApiService: FiberApiService,
    operatorService: OperatorService,
  ) {
    // Maintain the operator updated.
    operatorService.currentOperators.subscribe(operators => {
      if (operators) {
        this.operator = operators.nodeOperator;
      } else {
        this.operator = null;
      }
    });
  }

  initialize() {
    // Get the csrf config of the local node.
    this.fiberApiService.get(environment.nodeUrl, 'health').pipe(retryWhen(errors => errors.pipe(delay(3000)))).subscribe(response => {
      this.localNodeCsrfDisabledInternal = !response.csrf_enabled;
    });
  }
}
