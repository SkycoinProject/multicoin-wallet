import { Directive, ElementRef, Renderer2, OnInit, OnDestroy, RendererStyleFlags2, Input, HostListener } from '@angular/core';
import { SubscriptionLike } from 'rxjs';

import { CoinService } from '../../services/coin.service';

/**
 * Sets the 'color' css property of the element to the current main color.
 * If used as '[appMainColorText]="true"', the color property will be set to the main color only
 * when the mouse cursor is over the element, and will be set to null when it is not.
 */
@Directive({
  selector: '[appMainColorText]',
})
export class MainColorTextDirective implements OnInit, OnDestroy {
  // If true, the main color will be used only if the mouse cursor is over the element.
  private showIfMouseOverOnly = false;
  @Input() set appMainColorText(val: boolean) {
    this.showIfMouseOverOnly = val;
    this.updateColor();
  }

  // If the mouse is over the element.
  private mouseOver = false;
  // Current main color.
  private currentColor = '';
  private subscription: SubscriptionLike;

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private coinService: CoinService,
  ) { }

  ngOnInit(): void {
    // Get the main color.
    this.subscription = this.coinService.currentCoin.subscribe(coin => {
      this.currentColor = coin.styleConfig.mainColor;
      this.updateColor();
    });
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  // Mouse events.
  @HostListener('mouseenter') onMouseEnter() {
    this.mouseOver = true;
    this.updateColor();
  }
  @HostListener('mouseleave') onMouseLeave() {
    this.mouseOver = false;
    this.updateColor();
  }

  // Updates the css property.
  private updateColor() {
    if (!this.showIfMouseOverOnly || this.mouseOver) {
      // Use the main color.
      // tslint:disable-next-line:no-bitwise
      this.renderer.setStyle(this.el.nativeElement, 'color', this.currentColor, RendererStyleFlags2.DashCase | RendererStyleFlags2.Important);
    } else {
      // Unset the color property.
      this.renderer.setStyle(this.el.nativeElement, 'color', null);
    }
  }
}
