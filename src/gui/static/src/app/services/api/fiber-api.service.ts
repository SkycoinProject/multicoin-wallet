import { throwError as observableThrowError, Observable, of } from 'rxjs';
import { first, map, mergeMap, catchError } from 'rxjs/operators';
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';

import { processServiceError } from '../../utils/errors';
import { OperationError } from '../../utils/operation-error';
import { CoinService } from '../coin.service';

// IMPORTANT: AFTER MAKING MODIFICATIONS TO THIS INTERFACE YOU MUST ALSO
// MAKE APPROPIATE CHANGES TO THE createDefaultRequestOptions
// FUNCTION INSIDE FiberApiService.
/**
 * Options for configuring the requests to the Fiber node API.
 */
export interface FiberNodeApiRequestOptions {
  /**
   * If true, the request will be sent to the API v2 and not to the v1.
   */
  useV2?: boolean;
  /**
   * If true, the data will be sent to the node encoded as JSON. This only makes sense for POST
   * request while using the v1, as GET request only send the data as params on the URL and the
   * data is always sent encoded as JSON when using the API v2.
   */
  sendDataAsJson?: boolean;
}

/**
 * Allows to make request to the Fiber node api with ease. Check the node API documentation for
 * information about the API endpoints.
 */
@Injectable()
export class FiberApiService {
  constructor(
    private http: HttpClient,
  ) { }

  /**
   * Sends a GET request to the node API.
   * @param nodeUrl URL of the node.
   * @param endpointUrl URL to send the request to.
   * @param params Object with the key/value pairs to be sent to the node as part of
   * the querystring.
   * @param options Request options.
   */
  get(nodeUrl: string, endpointUrl: string, params: any = null, options: FiberNodeApiRequestOptions = null): Observable<any> {
    if (!options) {
      options = this.createDefaultRequestOptions();
    } else {
      options = Object.assign(this.createDefaultRequestOptions(), options);
    }

    return this.http.get(this.getUrl(nodeUrl, endpointUrl, params, options.useV2), this.returnRequestOptions(options, null)).pipe(
      catchError((error: any) => this.processConnectionError(error)));
  }

  /**
   * Sends a POST request to the node API.
   * @param nodeUrl URL of the node.
   * @param endpointUrl URL to send the request to.
   * @param params Object with the key/value pairs to be sent to the node as
   * x-www-form-urlencoded or JSON, as defined in the options param.
   * @param options Request options.
   */
  post(nodeUrl: string, endpointUrl: string, params: any = null, options: FiberNodeApiRequestOptions = null): Observable<any> {
    if (!options) {
      options = this.createDefaultRequestOptions();
    } else {
      options = Object.assign(this.createDefaultRequestOptions(), options);
    }

    return this.getCsrf(nodeUrl).pipe(first(), mergeMap(csrf => {
      // V2 always needs the data to be sent encoded as JSON.
      if (options.useV2) {
        options.sendDataAsJson = true;
      }

      return this.http.post(
        this.getUrl(nodeUrl, endpointUrl, null, options.useV2),
        options.sendDataAsJson ? (params ? JSON.stringify(params) : '') : this.getQueryString(params),
        this.returnRequestOptions(options, csrf),
      ).pipe(
        catchError((error: any) => this.processConnectionError(error)));
    }));
  }

  /**
   * Creates a FiberNodeApiRequestOptions instance with the default values.
   */
  private createDefaultRequestOptions(): FiberNodeApiRequestOptions {
    return {
      useV2: false,
      sendDataAsJson: false,
    };
  }

  /**
   * Gets a csrf token from the node, to be able to make a post request to the node API.
   * @param nodeUrl URL of the node.
   */
  private getCsrf(nodeUrl: string): Observable<string> {
    return this.get(nodeUrl, 'csrf').pipe(
      catchError((error: any) => {
        error = processServiceError(error);

        // If the node returns a 404 error, the csrf protection is disabled on the node.
        if (error && error.originalError && (error.originalError as HttpErrorResponse).status === 404) {
          return of({csrf_token: null});
        }

        return error;
      }),
      map(response => response.csrf_token),
    );
  }

  /**
   * Returns the options object requiered by HttpClient for sending a request.
   * @param options Options that will be used for making the request.
   * @param csrfToken Csrf token to be added on a header, for being able to make
   * POST requests.
   */
  private returnRequestOptions(options: FiberNodeApiRequestOptions, csrfToken: string): any {
    const requestOptions: any = {};

    requestOptions.headers = new HttpHeaders();
    requestOptions.headers = requestOptions.headers.append('Content-Type', options.sendDataAsJson ? 'application/json' : 'application/x-www-form-urlencoded');

    if (csrfToken) {
      requestOptions.headers = requestOptions.headers.append('X-CSRF-Token', csrfToken);
    }

    return requestOptions;
  }

  /**
   * Encodes a list of params as a query string, for being used for sending data
   * in a request.
   * @param parameters Object with the key/value pairs that will be used for
   * creating the querystring.
   */
  private getQueryString(parameters: any = null): string {
    if (!parameters) {
      return '';
    }

    return Object.keys(parameters).reduce((array, key) => {
      array.push(key + '=' + encodeURIComponent(parameters[key]));

      return array;
    }, []).join('&');
  }

  /**
   * Get the complete URL needed for making a request to the node API.
   * @param nodeUrl URL of the node.
   * @param endpointUrl URL to send the request to.
   * @param params Object with the key/value pairs to be sent to the node as part of
   * the querystring.
   * @param useV2 If the returned URL must point to the API v2 (true) or v1 (false).
   * @param sendToLocalNode If the request will be sent to the local node.
   */
  private getUrl(nodeUrl: string, endpointUrl: string, params: any = null, useV2 = false): string {
    // Sanitize the node URLs.
    if (!nodeUrl.endsWith('/api/')) {
      if (nodeUrl.endsWith('/')) {
        nodeUrl = nodeUrl.substr(0, nodeUrl.length - 1);
      }

      nodeUrl += '/api/';
    }

    if (endpointUrl.startsWith('/')) {
      endpointUrl = endpointUrl.substr(1, endpointUrl.length - 1);
    }

    return nodeUrl + (useV2 ? 'v2/' : 'v1/') + endpointUrl + '?' + this.getQueryString(params);
  }

  /**
   * Takes an error returned by the node and converts it to an instance of OperationError.
   * @param error Error obtained while triying to connect to the node API.
   */
  private processConnectionError(error: any): Observable<OperationError> {
    return observableThrowError(processServiceError(error));
  }
}
