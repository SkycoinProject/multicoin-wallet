import { Directive, ElementRef, Renderer2, OnInit, OnDestroy, RendererStyleFlags2, Input, HostListener } from '@angular/core';
import { SubscriptionLike } from 'rxjs';

import { CoinService } from '../../services/coin.service';

/**
 * Add filters to an <img> element with a black icon, so that the icon is shown using the
 * current main color. If used as '[appImageColor]="true"', the secondary color is used.
 */
@Directive({
  selector: '[appImageColor]',
})
export class ColorImageDirective implements OnInit, OnDestroy {
  // If true, the secondary color is used.
  private showSecondaryColor = false;
  @Input() set appImageColor(val: boolean) {
    this.showSecondaryColor = val;
    this.updateColor();
  }

  // Current filters.
  private mainColorFilter: string;
  private secondaryColorFilter: string;
  private subscription: SubscriptionLike;

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private coinService: CoinService,
  ) { }

  ngOnInit(): void {
    // Get the filters.
    this.subscription = this.coinService.currentCoin.subscribe(coin => {
      this.mainColorFilter = coin.styleConfig.mainColorImagesFilter;
      this.secondaryColorFilter = coin.styleConfig.secondaryColorImagesFilter;
      this.updateColor();
    });
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  // Updates the css property.
  private updateColor() {
    this.renderer.setStyle(this.el.nativeElement, 'filter', this.showSecondaryColor ? this.secondaryColorFilter : this.mainColorFilter);
  }
}
