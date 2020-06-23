import { Directive, ElementRef, Renderer2, OnDestroy, RendererStyleFlags2, AfterViewInit } from '@angular/core';
import { SubscriptionLike } from 'rxjs';

import { CoinService } from '../../services/coin.service';

/**
 * Makes a form element use the current main color. It is currently compatible with:
 *
 * - mat-checkbox
 * - mat-option
 * - mat-slider
 * - mat-spinner
 */
@Directive({
  selector: '[appMainColorFormElement]',
})
export class MainColorFormElementDirective implements OnDestroy, AfterViewInit {
  // Allows to detect changes in the DOM, to update the properties.
  private mutationObserver: MutationObserver;
  // Current main color.
  private currentColor = '';
  private subscription: SubscriptionLike;

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private coinService: CoinService,
  ) { }

  ngAfterViewInit() {
    // Update the properties if there are changes in the DOM.
    this.mutationObserver = new MutationObserver(() => this.updateColor());
    const config = { attributes: true, subtree: true };
    this.mutationObserver.observe(this.el.nativeElement, config);

    // Get the main color.
    this.subscription = this.coinService.currentCoin.subscribe(coin => {
      this.currentColor = coin.styleConfig.mainColor;
      this.updateColor();
    });
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
    this.mutationObserver.disconnect();
  }

  // Updates the css properties.
  private updateColor() {
    // For mat-spinner.
    const circle = this.el.nativeElement.querySelector('circle');
    if (circle) {
      this.renderer.setStyle(circle, 'stroke', this.currentColor);
    }

    // For mat-slider.
    const sliderThumb = this.el.nativeElement.querySelector('.mat-slider-thumb');
    if (sliderThumb) {
      this.renderer.setStyle(sliderThumb, 'background-color', this.currentColor);
    }
    const sliderThumbLabel = this.el.nativeElement.querySelector('.mat-slider-thumb-label');
    if (sliderThumbLabel) {
      this.renderer.setStyle(sliderThumbLabel, 'background-color', this.currentColor);
    }

    // For mat-option.
    const pseudoCheckboxChecked = this.el.nativeElement.querySelector('.mat-pseudo-checkbox-checked');
    const pseudoCheckbox = this.el.nativeElement.querySelector('.mat-pseudo-checkbox');
    if (pseudoCheckboxChecked) {
      this.renderer.setStyle(pseudoCheckboxChecked, 'background', this.currentColor);
    } else if (pseudoCheckbox) {
      this.renderer.setStyle(pseudoCheckbox, 'background', null);
    }

    // For mat-checkbox.
    const checkboxCheckmarkPath = this.el.nativeElement.querySelector('.mat-checkbox-checkmark-path');
    if (checkboxCheckmarkPath) {
      // tslint:disable-next-line:no-bitwise
      this.renderer.setStyle(checkboxCheckmarkPath, 'stroke', this.currentColor, RendererStyleFlags2.DashCase | RendererStyleFlags2.Important);

      const rippleElements = this.el.nativeElement.querySelectorAll('.mat-ripple-element');
      rippleElements.forEach(element => {
        this.renderer.setStyle(element, 'background', this.currentColor);
      });
    }
  }
}
