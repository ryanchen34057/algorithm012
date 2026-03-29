import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  IChartApi,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  Time,
} from 'lightweight-charts';
import { StockChartData, GapAnalysis } from '../types';
import { useColors } from './ThemeContext';

interface Props {
  chart: StockChartData;
  gap?: GapAnalysis;
}

export default function StockChart({ chart, gap }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const disposedRef = useRef(false);
  const c = useColors();

  useEffect(() => {
    if (!containerRef.current) return;

    // Safely remove previous chart instance
    if (chartRef.current && !disposedRef.current) {
      try {
        chartRef.current.remove();
      } catch {
        // Already disposed — ignore
      }
    }
    chartRef.current = null;
    disposedRef.current = false;

    const lc = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: c.chartBg },
        textColor: c.textSecondary,
      },
      grid: {
        vertLines: { color: c.gridLine },
        horzLines: { color: c.gridLine },
      },
      width: containerRef.current.clientWidth,
      height: 420,
      timeScale: { borderColor: c.border },
    });
    chartRef.current = lc;

    // ── Candlestick ─────────────────────────────────────────────────────
    const candleSeries = lc.addSeries(CandlestickSeries, {
      upColor: c.green,
      downColor: c.red,
      borderVisible: false,
      wickUpColor: c.green,
      wickDownColor: c.red,
    });

    candleSeries.setData(
      chart.candles.map((d) => ({
        time: d.date as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))
    );

    // ── Volume ──────────────────────────────────────────────────────────
    const volumeSeries = lc.addSeries(HistogramSeries, {
      color: c.border,
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    lc.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volumeSeries.setData(
      chart.candles.map((d) => ({
        time: d.date as Time,
        value: d.volume,
        color: d.close >= d.open ? c.green + '44' : c.red + '44',
      }))
    );

    // ── Moving averages ─────────────────────────────────────────────────
    const maConfigs = [
      { data: chart.ma20, color: '#22d3ee', title: 'MA20' },
      { data: chart.ma50, color: '#f59e0b', title: 'MA50' },
      { data: chart.ma150, color: '#a78bfa', title: 'MA150' },
      { data: chart.ma200, color: '#f472b6', title: 'MA200' },
    ];
    for (const { data, color, title } of maConfigs) {
      const maSeries = lc.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        title,
        crosshairMarkerVisible: false,
        lastValueVisible: true,
        priceLineVisible: false,
      });
      maSeries.setData(
        chart.candles
          .map((d, i) => ({ time: d.date as Time, value: data[i] }))
          .filter((d) => d.value > 0)
      );
    }

    // ── Gap price lines ─────────────────────────────────────────────────
    if (gap) {
      candleSeries.createPriceLine({
        price: gap.entryPrice,
        color: c.blue,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `進場 ${gap.entryPrice}`,
      });
      candleSeries.createPriceLine({
        price: gap.stopLoss,
        color: c.red,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `停損 ${gap.stopLoss}`,
      });
      candleSeries.createPriceLine({
        price: gap.target,
        color: gap.direction === 'long' ? c.green : '#f472b6',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `目標 ${gap.target}`,
      });
      // Yesterday's high/low reference lines
      candleSeries.createPriceLine({
        price: gap.yesterdayHigh,
        color: '#f59e0b88',
        lineWidth: 1,
        lineStyle: 1,
        axisLabelVisible: false,
        title: '昨高',
      });
      candleSeries.createPriceLine({
        price: gap.yesterdayLow,
        color: '#f59e0b88',
        lineWidth: 1,
        lineStyle: 1,
        axisLabelVisible: false,
        title: '昨低',
      });
    }

    lc.timeScale().fitContent();

    // ── Resize observer ─────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      if (containerRef.current && !disposedRef.current) {
        try {
          lc.applyOptions({ width: containerRef.current.clientWidth });
        } catch {
          // Chart was disposed during resize — ignore
        }
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      disposedRef.current = true;
      try {
        lc.remove();
      } catch {
        // Already disposed — ignore
      }
      chartRef.current = null;
    };
  }, [chart, gap, c]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', borderRadius: 8, overflow: 'hidden' }}
    />
  );
}
