import { Observable } from 'rxjs';
import { Injectable } from '@angular/core';

import { BlockchainOperator } from './coin-specific/blockchain-operator';
import { OperatorService } from './operators.service';

/**
 * Data about the current state of the blockchain in the node.
 */
export interface BlockchainState {
  lastBlock: BasicBlockInfo;
  coinSupply: CoinSupply;
}
/**
 * Basic info of the last block added to the blockchain.
 */
export interface BasicBlockInfo {
  seq: number;
  timestamp: number;
  hash: string;
}

/**
 * Data about the current and max coin supply.
 */
export interface CoinSupply {
  currentSupply: string;
  totalSupply: string;
  currentCoinhourSupply?: string;
  totalCoinhourSupply?: string;
}

/**
 * Info about the current synchronization state of the blockchain. Not all coins provide
 * information about the current blocks, specially if the blockchain is
 * already synchronized.
 */
export interface ProgressEvent {
  currentBlock: number;
  highestBlock: number;
  synchronized: boolean;
}

/**
 * Allows to check the current state of the blockchain.
 */
@Injectable()
export class BlockchainService {
  /**
   * Instance with the actual code for making most of the operations of this service. It is
   * specific for the currently selected coin.
   */
  private operator: BlockchainOperator;

  /**
   * Allows to know the current synchronization state of the blockchain. It is updated over time.
   */
  get progress(): Observable<ProgressEvent> {
    return this.operator.progress;
  }

  constructor(private operatorService: OperatorService) { }

  initialize() {
    // Maintain the operator updated.
    this.operatorService.currentOperators.subscribe(operators => {
      if (operators) {
        this.operator = operators.blockchainOperator;
      } else {
        this.operator = null;
      }
    });
  }

  /**
   * Gets the basic info of the last block and the coin supply of the blockchain .
   */
  getBlockchainState(): Observable<BlockchainState> {
    return this.operator.getBlockchainState();
  }
}
