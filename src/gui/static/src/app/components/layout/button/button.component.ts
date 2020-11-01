import { Component, EventEmitter, Input, Output, ViewChild, OnDestroy, Renderer2, AfterViewInit } from '@angular/core';
import { SubscriptionLike } from 'rxjs';

import { CoinService } from '../../../services/coin.service';
import { MatButton } from '@angular/material/button';

enum ButtonStates {
  Normal = 'Normal',
  Loading = 'Loading',
  Success = 'Success',
}

/**
 * Normal rounded button used in most parts of the app.
 */
@Component({
  selector: 'app-button',
  templateUrl: 'button.component.html',
  styleUrls: ['button.component.scss'],
})
export class ButtonComponent implements AfterViewInit, OnDestroy {
  // If true, the button is shown with the main gradiend as background.
  private useMainGradientInternal = false;
  @Input() set useMainGradient(val: boolean) {
    this.useMainGradientInternal = val;
    this.updateStyle();
  }
  get useMainGradient(): boolean {
    return this.useMainGradientInternal;
  }

  // Disables the button.
  private disabledInternal = false;
  @Input() set disabled(val: boolean) {
    this.disabledInternal = val;
    this.updateStyle();
  }
  get disabled(): boolean {
    return this.disabledInternal;
  }

  // If true, the button will send click events even when disabled.
  @Input() forceEmitEvents = false;
  // Click event.
  @Output() action = new EventEmitter();
  @ViewChild('button') button: MatButton;

  state = ButtonStates.Normal;
  buttonStates = ButtonStates;

  // Colors of the main gradient than can be used as background.
  private gradientColor1 = '';
  private gradientColor2 = '';
  private subscription: SubscriptionLike;

  constructor(
    coinService: CoinService,
    private renderer: Renderer2,
  ) {
    // Get the main colors.
    this.subscription = coinService.currentCoin.subscribe(coin => {
      this.gradientColor1 = coin.styleConfig.gradientDark;
      this.gradientColor2 = coin.styleConfig.gradientLight;
      this.updateStyle();
    });
  }

  ngAfterViewInit() {
    this.updateStyle();
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
    this.action.complete();
  }

  onClick() {
    if (!this.disabled || this.forceEmitEvents) {
      this.action.emit();
    }
  }

  /**
   * Focuses the button.
   */
  focus() {
    this.button.focus();
  }

  /**
   * Shows the loading animation. The button does not send click events while the
   * animation is active.
   */
  setLoading() {
    this.state = ButtonStates.Loading;
  }

  /**
   * Shows the success icon.
   */
  setSuccess() {
    this.state = ButtonStates.Success;
    setTimeout(() => this.state = ButtonStates.Normal, 3000);
  }

  setDisabled() {
    this.disabled = true;
  }

  setEnabled() {
    this.disabled = false;
  }

  isLoading(): boolean {
    return this.state === ButtonStates.Loading;
  }

  /**
   * Removes the icons and animations, but does not affects the enabled/disabled status.
   * @returns The currents instance is returned to make it easier to concatenate function calls.
   */
  resetState() {
    this.state = ButtonStates.Normal;

    return this;
  }

  // Updates the style color.
  private updateStyle() {
    if (this.button) {
      if (this.useMainGradientInternal && !this.disabled) {
        // Show the main gradient as background.
        this.renderer.setStyle(this.button._elementRef.nativeElement, 'background', 'linear-gradient(to bottom right, ' + this.gradientColor1 + ', ' + this.gradientColor2 + ')');
        this.renderer.setStyle(this.button._elementRef.nativeElement, 'color', 'white');
      } else {
        // Show the standard background.
        this.renderer.setStyle(this.button._elementRef.nativeElement, 'background', null);
        this.renderer.setStyle(this.button._elementRef.nativeElement, 'color', null);
      }
    }
  }
}
