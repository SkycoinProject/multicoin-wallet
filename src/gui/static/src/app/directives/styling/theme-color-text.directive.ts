import { Directive, ElementRef, Renderer2, OnInit, OnDestroy, RendererStyleFlags2, Input, HostListener } from '@angular/core';
import { SubscriptionLike } from 'rxjs';

import { CoinService } from '../../services/coin.service';

/**
 * Sets the 'color' css property of the element to the current main or secondary color.
 * If used as '[appThemeColorText]="true"', the secondary color is used. If you use
 * '[showOnlyIfMouseOver]="true"', the color property will be set only when the mouse
 * cursor is over the element, and will be set to null when it is not.
 */
@Directive({
  selector: '[appThemeColorText]',
})
export class ThemeColorTextDirective implements OnInit, OnDestroy {
  // If true, the color will be used only if the mouse cursor is over the element.
  private showOnlyIfMouseOverInternal = false;
  @Input() set showOnlyIfMouseOver(val: boolean) {
    this.showOnlyIfMouseOverInternal = val;
    this.updateColor();
  }

  // If true, the secondary color is used.
  private showSecondaryColor = false;
  @Input() set appThemeColorText(val: boolean) {
    this.showSecondaryColor = val;
    this.updateColor();
  }

  // If the mouse is over the element.
  private mouseOver = false;
  // Current colors.
  private currentMainColor = '';
  private currentSecondaryColor = '';
  private subscription: SubscriptionLike;

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private coinService: CoinService,
  ) { }

  ngOnInit(): void {
    // Get the colors.
    this.subscription = this.coinService.currentCoin.subscribe(coin => {
      this.currentMainColor = coin.styleConfig.mainColor;
      this.currentSecondaryColor = coin.styleConfig.secondaryColor;
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
    if (!this.showOnlyIfMouseOverInternal || this.mouseOver) {
      const color = this.showSecondaryColor ? this.currentSecondaryColor : this.currentMainColor;
      // Use the color.
      // tslint:disable-next-line:no-bitwise
      this.renderer.setStyle(this.el.nativeElement, 'color', color, RendererStyleFlags2.DashCase | RendererStyleFlags2.Important);
    } else {
      // Unset the color property.
      this.renderer.setStyle(this.el.nativeElement, 'color', null);
    }
  }
}
