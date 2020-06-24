/**
 * Base class with the configurations for customizing the colors of some UI elements when a
 * specific coin is selected. Each property must be set to a valid css color value.
 */
export class CoinStyleBase {
  // Main color, used for links and some other UI elements.
  mainColor = '#0072ff';
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
