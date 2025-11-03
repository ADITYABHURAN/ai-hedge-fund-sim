/**
 * Technical Indicators Library
 * Collection of common technical analysis indicators for trading strategies
 */

/**
 * Simple Moving Average (SMA)
 * @param prices Array of prices
 * @param period Number of periods for the average
 * @returns Array of SMA values (shorter than input by period-1)
 */
export function simpleMovingAverage(prices: number[], period: number): number[] {
  if (prices.length < period) {
    throw new Error(`Not enough data points. Need ${period}, have ${prices.length}`);
  }
  
  const sma: number[] = [];
  
  for (let i = period - 1; i < prices.length; i++) {
    const sum = prices.slice(i - period + 1, i + 1).reduce((acc, price) => acc + price, 0);
    sma.push(sum / period);
  }
  
  return sma;
}

/**
 * Exponential Moving Average (EMA)
 * @param prices Array of prices
 * @param period Number of periods for the average
 * @returns Array of EMA values
 */
export function exponentialMovingAverage(prices: number[], period: number): number[] {
  if (prices.length < period) {
    throw new Error(`Not enough data points. Need ${period}, have ${prices.length}`);
  }
  
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // First EMA is SMA
  const firstSMA = prices.slice(0, period).reduce((acc, price) => acc + price, 0) / period;
  ema.push(firstSMA);
  
  // Calculate subsequent EMAs
  for (let i = period; i < prices.length; i++) {
    const currentEMA = (prices[i] * multiplier) + (ema[ema.length - 1] * (1 - multiplier));
    ema.push(currentEMA);
  }
  
  return ema;
}

/**
 * Relative Strength Index (RSI)
 * @param prices Array of closing prices
 * @param period Period for RSI calculation (typically 14)
 * @returns Array of RSI values (0-100)
 */
export function relativeStrengthIndex(prices: number[], period: number = 14): number[] {
  if (prices.length < period + 1) {
    throw new Error(`Not enough data points. Need ${period + 1}, have ${prices.length}`);
  }
  
  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  // Calculate price changes
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  // Calculate initial average gain and loss
  let avgGain = gains.slice(0, period).reduce((acc, gain) => acc + gain, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((acc, loss) => acc + loss, 0) / period;
  
  // Calculate first RSI
  const rs = avgGain / avgLoss;
  rsi.push(100 - (100 / (1 + rs)));
  
  // Calculate subsequent RSIs using smoothed averages
  for (let i = period; i < gains.length; i++) {
    avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
    avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;
    
    const currentRS = avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + currentRS)));
  }
  
  return rsi;
}

/**
 * MACD (Moving Average Convergence Divergence)
 * @param prices Array of closing prices
 * @param fastPeriod Fast EMA period (typically 12)
 * @param slowPeriod Slow EMA period (typically 26)
 * @param signalPeriod Signal line EMA period (typically 9)
 * @returns Object with MACD line, signal line, and histogram
 */
export function macd(
  prices: number[], 
  fastPeriod: number = 12, 
  slowPeriod: number = 26, 
  signalPeriod: number = 9
): { macd: number[], signal: number[], histogram: number[] } {
  if (prices.length < slowPeriod) {
    throw new Error(`Not enough data points. Need ${slowPeriod}, have ${prices.length}`);
  }
  
  const fastEMA = exponentialMovingAverage(prices, fastPeriod);
  const slowEMA = exponentialMovingAverage(prices, slowPeriod);
  
  // Calculate MACD line (fast EMA - slow EMA)
  const macdLine: number[] = [];
  const startIndex = slowPeriod - fastPeriod;
  
  for (let i = startIndex; i < fastEMA.length; i++) {
    macdLine.push(fastEMA[i] - slowEMA[i - startIndex]);
  }
  
  // Calculate signal line (EMA of MACD line)
  const signalLine = exponentialMovingAverage(macdLine, signalPeriod);
  
  // Calculate histogram (MACD - Signal)
  const histogram: number[] = [];
  const histogramStartIndex = macdLine.length - signalLine.length;
  
  for (let i = 0; i < signalLine.length; i++) {
    histogram.push(macdLine[histogramStartIndex + i] - signalLine[i]);
  }
  
  return {
    macd: macdLine,
    signal: signalLine,
    histogram: histogram
  };
}

/**
 * Bollinger Bands
 * @param prices Array of closing prices
 * @param period Period for moving average (typically 20)
 * @param multiplier Standard deviation multiplier (typically 2)
 * @returns Object with upper band, middle band (SMA), and lower band
 */
export function bollingerBands(
  prices: number[], 
  period: number = 20, 
  multiplier: number = 2
): { upper: number[], middle: number[], lower: number[] } {
  if (prices.length < period) {
    throw new Error(`Not enough data points. Need ${period}, have ${prices.length}`);
  }
  
  const sma = simpleMovingAverage(prices, period);
  const upper: number[] = [];
  const lower: number[] = [];
  
  for (let i = 0; i < sma.length; i++) {
    const dataIndex = i + period - 1;
    const slice = prices.slice(dataIndex - period + 1, dataIndex + 1);
    
    // Calculate standard deviation
    const mean = sma[i];
    const variance = slice.reduce((acc, price) => acc + Math.pow(price - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    
    upper.push(mean + (multiplier * stdDev));
    lower.push(mean - (multiplier * stdDev));
  }
  
  return {
    upper: upper,
    middle: sma,
    lower: lower
  };
}

/**
 * Stochastic Oscillator
 * @param highs Array of high prices
 * @param lows Array of low prices
 * @param closes Array of closing prices
 * @param period Period for calculation (typically 14)
 * @returns Array of %K values (0-100)
 */
export function stochasticOscillator(
  highs: number[], 
  lows: number[], 
  closes: number[], 
  period: number = 14
): number[] {
  if (highs.length !== lows.length || lows.length !== closes.length) {
    throw new Error('High, low, and close arrays must have the same length');
  }
  
  if (highs.length < period) {
    throw new Error(`Not enough data points. Need ${period}, have ${highs.length}`);
  }
  
  const stochastic: number[] = [];
  
  for (let i = period - 1; i < closes.length; i++) {
    const highSlice = highs.slice(i - period + 1, i + 1);
    const lowSlice = lows.slice(i - period + 1, i + 1);
    
    const highestHigh = Math.max(...highSlice);
    const lowestLow = Math.min(...lowSlice);
    
    const k = ((closes[i] - lowestLow) / (highestHigh - lowestLow)) * 100;
    stochastic.push(k);
  }
  
  return stochastic;
}

/**
 * Average True Range (ATR) - Measure of volatility
 * @param highs Array of high prices
 * @param lows Array of low prices
 * @param closes Array of closing prices
 * @param period Period for ATR calculation (typically 14)
 * @returns Array of ATR values
 */
export function averageTrueRange(
  highs: number[], 
  lows: number[], 
  closes: number[], 
  period: number = 14
): number[] {
  if (highs.length !== lows.length || lows.length !== closes.length) {
    throw new Error('High, low, and close arrays must have the same length');
  }
  
  if (highs.length < period + 1) {
    throw new Error(`Not enough data points. Need ${period + 1}, have ${highs.length}`);
  }
  
  const trueRanges: number[] = [];
  
  // Calculate True Range for each period
  for (let i = 1; i < closes.length; i++) {
    const tr1 = highs[i] - lows[i];
    const tr2 = Math.abs(highs[i] - closes[i - 1]);
    const tr3 = Math.abs(lows[i] - closes[i - 1]);
    
    trueRanges.push(Math.max(tr1, tr2, tr3));
  }
  
  // Calculate ATR using SMA of True Ranges
  return simpleMovingAverage(trueRanges, period);
}

/**
 * Check if a moving average crossover occurred
 * @param fastMA Fast moving average array
 * @param slowMA Slow moving average array
 * @param lookback How many periods back to check for crossover
 * @returns Object with bullish and bearish crossover flags
 */
export function movingAverageCrossover(
  fastMA: number[], 
  slowMA: number[], 
  lookback: number = 1
): { bullishCrossover: boolean, bearishCrossover: boolean } {
  if (fastMA.length !== slowMA.length || fastMA.length < lookback + 1) {
    return { bullishCrossover: false, bearishCrossover: false };
  }
  
  const currentFast = fastMA[fastMA.length - 1];
  const currentSlow = slowMA[slowMA.length - 1];
  const prevFast = fastMA[fastMA.length - 1 - lookback];
  const prevSlow = slowMA[slowMA.length - 1 - lookback];
  
  const bullishCrossover = prevFast <= prevSlow && currentFast > currentSlow;
  const bearishCrossover = prevFast >= prevSlow && currentFast < currentSlow;
  
  return { bullishCrossover, bearishCrossover };
}

/**
 * Calculate support and resistance levels
 * @param highs Array of high prices
 * @param lows Array of low prices
 * @param period Period to look for local peaks and valleys
 * @returns Object with support and resistance levels
 */
export function supportResistanceLevels(
  highs: number[], 
  lows: number[], 
  period: number = 10
): { support: number[], resistance: number[] } {
  const support: number[] = [];
  const resistance: number[] = [];
  
  // Find local minima (support)
  for (let i = period; i < lows.length - period; i++) {
    const slice = lows.slice(i - period, i + period + 1);
    const minValue = Math.min(...slice);
    
    if (lows[i] === minValue) {
      support.push(lows[i]);
    }
  }
  
  // Find local maxima (resistance)
  for (let i = period; i < highs.length - period; i++) {
    const slice = highs.slice(i - period, i + period + 1);
    const maxValue = Math.max(...slice);
    
    if (highs[i] === maxValue) {
      resistance.push(highs[i]);
    }
  }
  
  return { support, resistance };
}