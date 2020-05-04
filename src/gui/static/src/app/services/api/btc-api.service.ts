import { throwError as observableThrowError, Observable, of } from 'rxjs';
import { mergeMap, catchError } from 'rxjs/operators';
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';

import { processServiceError } from '../../utils/errors';

/**
 * Allows to make request to the btcd node api with ease. Check the node API documentation for
 * information about the API endpoints.
 */
@Injectable()
export class BtcApiService {
  constructor(
    private http: HttpClient,
  ) { }

  /**
   * Calls a RPC method of the btcd node. If the call returns an error in the "error" field of
   * the RPC response, an error is thrown.
   * @param nodeUrl URL of the node.
   * @param methodName Name of the RPC method to call.
   * @param params Params to send while calling the method.
   * @returns Response obtained after calling the method. Only the "result" part of the RPC
   * response is returned.
   */
  callRpcMethod(nodeUrl: string, methodName: string, params: any = null): Observable<any> {
    // Populate the RPC fields.
    const requestBody = {
      jsonrpc: '2.0',
      method: methodName,
      id: '0',
    };

    if (params) {
      requestBody['params'] = params;
    }

    // Add the auth credentials.
    const requestOptions: any = {};
    requestOptions.headers = new HttpHeaders();
    requestOptions.headers = requestOptions.headers.append('Authorization', 'Basic dXNlcjoxMjM=');

    // Send the request and process the errors.
    // TODO: error processing could be better. It would be good to add better information
    // for known errors.
    return this.http.post(nodeUrl, JSON.stringify(requestBody), requestOptions).pipe(
      catchError((error: any) => {
        return observableThrowError(processServiceError(error));
      }),
      mergeMap((response: any) => {
        if (response.error) {
          return observableThrowError(processServiceError(response.error));
        }

        return of(response.result);
      }),
    );
  }
}
