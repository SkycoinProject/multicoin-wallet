import { throwError as observableThrowError, Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { processServiceError } from '../../utils/errors';
import { OperationError } from '../../utils/operation-error';

/**
 * Allows to make request to the Blockbook api with ease. Check the API documentation for
 * information about the API endpoints.
 */
@Injectable()
export class BlockbookApiService {
  constructor(
    private http: HttpClient,
  ) { }

  /**
   * Sends a GET request to the API.
   * @param url URL to access Blockbook.
   * @param endpointUrl URL to send the request to.
   * @param params Object with the key/value pairs to be sent to the API as part of
   * the querystring.
   */
  get(url: string, endpointUrl: string, params: any = null): Observable<any> {
    return this.http.get(this.getUrl(url, endpointUrl, params)).pipe(
      catchError((error: any) => this.processConnectionError(error)));
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
   * Get the complete URL needed for making a request to the API.
   * @param url URL to access Blockbook.
   * @param endpointUrl URL to send the request to.
   * @param params Object with the key/value pairs to be sent to the API as part of
   * the querystring.
   */
  private getUrl(url: string, endpointUrl: string, params: any): string {
    // Sanitize the URLs.
    if (!url.endsWith('/api/')) {
      if (url.endsWith('/')) {
        url = url.substr(0, url.length - 1);
      }

      url += '/api/';
    }

    if (endpointUrl.startsWith('/')) {
      endpointUrl = endpointUrl.substr(1, endpointUrl.length - 1);
    }

    // The '/api' endpoint must not be preceded by '/v2/'.
    const response = url + (!endpointUrl.includes('api') ? 'v2/' : '') + endpointUrl;
    const urlParams = this.getQueryString(params);

    return response + (urlParams ? '?' + this.getQueryString(params) : '');
  }

  /**
   * Takes an error returned by the API and converts it to an instance of OperationError.
   * @param error Error obtained while triying to connect to the API.
   */
  private processConnectionError(error: any): Observable<OperationError> {
    return observableThrowError(processServiceError(error));
  }
}
