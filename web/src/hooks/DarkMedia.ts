import React from "react";

const media = window.matchMedia('(prefers-color-scheme: dark)');

function useDarkMedia() {
    const [dark, setDark] = React.useState(media.matches);
    React.useEffect(() => {
        const listener = () => {
            setDark(media.matches);
        };
        media.addEventListener('change', listener);
        return () => {
            media.removeEventListener('change', listener);
        };
    }, []);
    return dark;
}

export default useDarkMedia;
