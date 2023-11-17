import React from "react";

function useVisibility() {
    const [visibility, setVisibility] = React.useState(true);
    React.useEffect(() => {
        document.addEventListener("visibilitychange", () => {
            setVisibility(!document.hidden);
        });
    }, []);
    return visibility;
}

export default useVisibility
