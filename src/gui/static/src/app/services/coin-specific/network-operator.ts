import { Observable } from 'rxjs';

export enum ConnectionSources {
  /**
   * Default node to which the node will always try to connect when started.
   */
  Default = 'default',
  /**
   * Informed by a remote node.
   */
  Exchange = 'exchange',
}

/**
 * Represents a connection a Fiber node has with another node.
 */
export interface Connection {
  /**
   * Address of the remote node.
   */
  address: string;
  /**
   * Connection port.
   */
  listenPort: number;
  /**
   * If the connection is outgoing or not.
   */
  outgoing: boolean;
  /**
   * Highest block on the remote node.
   */
  height: number;
  /**
   * Last time in which data was sent to the remote node, in Unix time.
   */
  lastSent: number;
  /**
   * Last time in which data was received from the remote node, in Unix time.
   */
  lastReceived: number;
  /**
   * Source from were the remote node was discovered.
   */
  source: ConnectionSources;
}

/**
 * Interface with the elements the operators for NetworkService must have.
 * Much of it is similar to NetworkService, so you can find more info in that class.
 */
export interface NetworkOperator {
  // Properties. Documented on the service.
  noConnections: boolean;

  /**
   * Makes the operator close all observables and run cleaning procedures. Must be called when
   * the operator is going to be replaced.
   */
  dispose();

  // Functions related to the state of the network. Documented on the service.
  connections(): Observable<Connection[]>;
}
