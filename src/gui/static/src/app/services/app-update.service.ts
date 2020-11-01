import { delay, retryWhen, mergeMap } from 'rxjs/operators';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';

import { shouldUpgradeVersion } from '../utils/general-utils';
import { AppConfig } from '../app.config';
import { FiberApiService } from './api/fiber-api.service';
import { environment } from '../../environments/environment';

/**
 * Allows check if there is an update available.
 */
@Injectable()
export class AppUpdateService {
  /**
   * Version number of the app. Empty while getting the data. Empty while getting the data.
   */
  get appVersion() {
    return this.appVersionInternal;
  }
  private appVersionInternal = '';

  /**
   * Indicates if there is an update for this app available for download. False while getting
   * the data.
   */
  get updateAvailable(): boolean {
    return this.updateAvailableInternal;
  }
  private updateAvailableInternal = false;

  /**
   * Number of the lastest version available for download of this app. Empty while getting
   * the data.
   */
  get lastestVersion(): string {
    return this.lastestVersionInternal;
  }
  private lastestVersionInternal = '';

  constructor(
    private fiberApiService: FiberApiService,
    private http: HttpClient,
  ) { }

  initialize() {
    // Get the current version of the app.
    this.fiberApiService.get(environment.nodeUrl, 'health').pipe(mergeMap(response => {
      this.appVersionInternal = response.version.version;

      // Get the lastest version available for download.
      if (AppConfig.urlForVersionChecking) {
        return this.http.get(AppConfig.urlForVersionChecking, { responseType: 'text' });
      } else {
        return of('0.0.0');
      }
    }),
      retryWhen(errors => errors.pipe(delay(30000))),
    ).subscribe((response: string) => {
      this.lastestVersionInternal = response.trim();
      if (this.lastestVersionInternal.startsWith('v')) {
        this.lastestVersionInternal = this.lastestVersionInternal.substr(1);
      }
      this.updateAvailableInternal = shouldUpgradeVersion(this.appVersionInternal, this.lastestVersionInternal);
    });
  }
}
