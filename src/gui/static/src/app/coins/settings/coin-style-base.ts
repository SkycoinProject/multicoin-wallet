/**
 * Base class with the configurations for customizing the colors of some UI elements when a
 * specific coin is selected. Each property must be set to a valid css color value.
 */
export class CoinStyleBase {
  // Main color, used for links and some other UI elements. Blue for Skycoin.
  mainColor = '#0072ff';
  // Secondary color, used in some icons. Yellow for Skycoin.
  secondaryColor = '#ffc125';

  // Filters used to make the base black icons have the main and secondary colors of the coin.
  // Must have valid values for the "filter" css property, without the ";" at the end.
  // You can use utilities like https://codepen.io/sosuke/pen/Pjoqqp to get the correct filter.
  mainColorImagesFilter = 'invert(26%) sepia(98%) saturate(3197%) hue-rotate(206deg) brightness(105%) contrast(104%)';
  secondaryColorImagesFilter = 'invert(84%) sepia(24%) saturate(2995%) hue-rotate(338deg) brightness(106%) contrast(101%)';

  // Colors for the app gradients, used as background on the wizard and some buttons.
  gradientDark = '#0072ff';
  gradientLight = '#00C3ff';
  onboardingGradientDark = '#0072ff';
  onboardingGradientLight = '#00C3ff';

  // Color of the texts shown on the app header.
  headerTextColor = '#fff';
  // Color for the small background shown behind the available hours and synchronization
  // progress indicator, in the app header.
  headerHoursBackgroundColor = 'rgba(255, 255, 255, 0.3)';
  // Color for texts with the available hours and synchronization progress indicator, in
  // the app header.
  headerHoursTextColor = '#000';
}
