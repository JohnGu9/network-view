import React from 'react';

import { EChartsOption } from 'echarts';
import * as echarts from 'echarts/core';
import { GraphChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([LineChart, GraphChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

function useEChart<T extends HTMLElement>(ref: React.RefObject<T>, option: EChartsOption) {
    const [chart, setChart] = React.useState<echarts.ECharts | null>(null);
    React.useEffect(() => {
        const chart = echarts.init(ref.current!);
        setChart(chart);

        const cb = () => {
            chart.resize();
        }
        const ob = new ResizeObserver(cb);
        ob.observe(ref.current!);
        cb();
        return () => {
            ob.disconnect();
            chart.dispose();
        }
    }, [ref]);
    React.useEffect(() => {
        chart?.setOption(option);
    }, [chart, option]);

}

export default useEChart;
export { echarts };
