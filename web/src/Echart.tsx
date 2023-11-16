import * as echarts from 'echarts';
import React from 'react';

function useEChart<T extends HTMLElement>(ref: React.RefObject<T>, option: echarts.EChartsOption) {
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
