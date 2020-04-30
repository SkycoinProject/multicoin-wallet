import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { FiberApiService } from './api/fiber-api.service';
import { OperationError } from '../utils/operation-error';
import { processServiceError } from '../utils/errors';
import { environment } from '../../environments/environment';

/**
 * Types of storage data. Types serve as a way of separating the saved data, so there could
 * be 2 different values saved using the same key to identify them, but only if the 2 values
 * are of different type.
 */
export enum StorageType {
  /**
   * Type used for general data.
   */
  CLIENT = 'client',
  /**
   * Type used for transaction notes.
   */
  NOTES = 'txid',
}

/**
 * Allows to save and read data to and from the node persistent key/value storage.
 */
@Injectable()
export class StorageService {

  constructor(
    private fiberApiService: FiberApiService,
  ) { }

  /**
   * Retrieves data from the node persistent key/value storage.
   * @param type Type of the value to be retrieved.
   * @param key Key idenfying the value to be retrieved. If no key is provided, all the
   * saved value of the provided type will be returned.
   * @returns The retrieved data, or null if the data was not found. If a key is provided,
   * the data will be directly in the response. If no key is provided, the response will
   * be an object which will contain properties with the name of every key saved on the
   * persistent key/value storage, set to the corresponding value.
   */
  get(type: StorageType, key: string|null): Observable<any> {
    const params = <any> { type };

    if (key) {
      params.key = key;
    }

    return this.fiberApiService.get(environment.nodeUrl, 'data', params, { useV2: true }).pipe(
      map(result => result.data),
      catchError((err: OperationError) => {
        // If the node returned a 404 error, it means the data was not found, not
        // that there was an error during the operation, so we can continue.
        err = processServiceError(err);
        try {
          if (err && err.originalError &&  err.originalError.status && err.originalError.status === 404) {
            return of(null);
          }
        } catch (e) {}

        return throwError(err);
      }),
    );
  }

  /**
   * Saves a value on the node persistent key/value storage.
   * @param type Type of the value to be saved.
   * @param key Key which will identify the value. If the key already exist, the saved data
   * will be overwritten.
   * @returns The returned observable returns nothing, but it can fail in case of error.
   */
  store(type: StorageType, key: string, value: string): Observable<any> {
    return this.fiberApiService.post(environment.nodeUrl, 'data', {
      type: type,
      key: key,
      val: value,
    }, { useV2: true });
  }
}
