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
import { useColors } from './ThemeContext';

interface Props {
  chart: StockChartData;
  vcp?: VCPAnalysis;
}

export default function StockChart({ chart, vcp }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const c = useColors();

  useEffect(() => {
    if (!containerRef.current) return;

    chartRef.current?.remove();

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

    const maConfigs = [
      { data: chart.ma50, color: '#f59e0b', title: 'MA50' },
      { data: chart.ma150, color: '#a78bfa', title: 'MA150' },
      { data: chart.ma200, color: '#f472b6', title: 'MA200' },
    ];
    for (const { data, color, title } of maConfigs) {
      const maSeries = lc.addSeries(LineSeries, { color, lineWidth: 1, title });
      maSeries.setData(
        chart.candles
          .map((d, i) => ({ time: d.date as Time, value: data[i] }))
          .filter((d) => d.value > 0)
      );
    }

    if (vcp) {
      candleSeries.createPriceLine({
        price: vcp.entryPrice,
        color: c.blue,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `進場 ${vcp.entryPrice}`,
      });
      candleSeries.createPriceLine({
        price: vcp.stopLoss,
        color: c.red,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `停損 ${vcp.stopLoss}`,
      });
      candleSeries.createPriceLine({
        price: vcp.target,
        color: c.green,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `目標 ${vcp.target}`,
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
  }, [chart, vcp, c]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', borderRadius: 8, overflow: 'hidden' }}
    />
  );
}
