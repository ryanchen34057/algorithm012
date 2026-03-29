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
import { StockChartData, VCPAnalysis } from '../types';

interface Props {
  chart: StockChartData;
  vcp?: VCPAnalysis;
}

export default function StockChart({ chart, vcp }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    chartRef.current?.remove();

    const lc = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f172a' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      width: containerRef.current.clientWidth,
      height: 420,
      timeScale: { borderColor: '#334155' },
    });
    chartRef.current = lc;

    // ── Candlestick series ──────────────────────────────────────────────
    const candleSeries = lc.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    candleSeries.setData(
      chart.candles.map((c) => ({
        time: c.date as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    // ── Volume histogram ────────────────────────────────────────────────
    const volumeSeries = lc.addSeries(HistogramSeries, {
      color: '#334155',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    lc.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volumeSeries.setData(
      chart.candles.map((c) => ({
        time: c.date as Time,
        value: c.volume,
        color: c.close >= c.open ? '#16a34a44' : '#dc262644',
      }))
    );

    // ── Moving averages ─────────────────────────────────────────────────
    const maConfigs = [
      { data: chart.ma50, color: '#f59e0b', title: 'MA50' },
      { data: chart.ma150, color: '#a78bfa', title: 'MA150' },
      { data: chart.ma200, color: '#f472b6', title: 'MA200' },
    ];
    for (const { data, color, title } of maConfigs) {
      const maSeries = lc.addSeries(LineSeries, { color, lineWidth: 1, title });
      maSeries.setData(
        chart.candles
          .map((c, i) => ({ time: c.date as Time, value: data[i] }))
          .filter((d) => d.value > 0)
      );
    }

    // ── VCP price lines ─────────────────────────────────────────────────
    if (vcp) {
      candleSeries.createPriceLine({
        price: vcp.entryPrice,
        color: '#3b82f6',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `Entry ${vcp.entryPrice}`,
      });
      candleSeries.createPriceLine({
        price: vcp.stopLoss,
        color: '#ef4444',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `Stop ${vcp.stopLoss}`,
      });
      candleSeries.createPriceLine({
        price: vcp.target,
        color: '#22c55e',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `Target ${vcp.target}`,
      });
    }

    lc.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        lc.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      lc.remove();
    };
  }, [chart, vcp]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', borderRadius: 8, overflow: 'hidden' }}
    />
  );
}
