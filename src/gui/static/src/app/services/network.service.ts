import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { Connection, NetworkOperator } from './coin-specific/network-operator';
import { OperatorService } from './operators.service';

/**
 * Allows to know if the node is connected to any remote node and to get the list of those nodes.
 *
 * NOTE: the functionality for getting the list of remote nodes is currently designed for Fiber
 * coins only.
 */
@Injectable()
export class NetworkService {
  /**
   * Instance with the actual code for making most of the operations of this service. It is
   * specific for the currently selected coin.
   */
  private operator: NetworkOperator;

  /**
   * Indicates if the node is not currently connected to any remote node.
   */
  get noConnections(): boolean {
    return this.operator.noConnections;
  }

  constructor(private operatorService: OperatorService) { }

  initialize() {
    // Maintain the operator updated.
    this.operatorService.currentOperators.subscribe(operators => {
      if (operators) {
        this.operator = operators.networkOperator;
      } else {
        this.operator = null;
      }
    });
  }

  /**
   * Gets the lists of remote nodes the node is currently connected to.
   */
  connections(): Observable<Connection[]> {
    return this.operator.connections();
  }
}
