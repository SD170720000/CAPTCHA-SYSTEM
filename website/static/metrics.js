console.log("METRICS loaded");

window.METRICS = {

    timings: {
        total_solve_time_ms: 0,
    },

    mouse: {
        path: [],
        path_length_px: 0,
        idle_time_ms: 0,
        avg_speed_px_per_ms: 0,
        max_speed_px_per_ms: 0,
        speed_variance: 0,
        direction_changes: 0
    },

    clicks: {
        total_clicks: 0,
        click_intervals_ms: [],
        all_clicks: [],
        picked_letters: [],
    },

    interaction: {
        device_type: "",
        screen_resolution: "",
        viewport_size: "",
        fps_estimate: 0,
        is_headless: false
    }

};


//-----------------------------------------------------------
// HEADLESS BROWSER CHECK
//-----------------------------------------------------------
function isHeadlessBrowser() {
    return (
        navigator.webdriver === true ||
        /HeadlessChrome/.test(navigator.userAgent) ||
        /PhantomJS/.test(navigator.userAgent) ||
        /Nightmare/.test(navigator.userAgent)
    );
}



//-----------------------------------------------------------
// START
//-----------------------------------------------------------
METRICS.start = () => {

    window.challenge_start_time = performance.now();

    METRICS.interaction.device_type =
        navigator.userAgent.includes("Mobile") ? "touch" : "mouse";

    METRICS.interaction.screen_resolution = `${screen.width}x${screen.height}`;
    METRICS.interaction.viewport_size = `${innerWidth}x${innerHeight}`;

    METRICS.interaction.is_headless = isHeadlessBrowser();
};


//-----------------------------------------------------------
// MOUSE TRACKING
//-----------------------------------------------------------
document.addEventListener("mousemove", e => {
    METRICS.mouse.path.push({
        x: e.clientX,
        y: e.clientY,
        t: performance.now()
    });
});


//-----------------------------------------------------------
// GLOBAL CLICK CAPTURE
//-----------------------------------------------------------
document.addEventListener("click", e => {

    let t = performance.now();

    METRICS.clicks.total_clicks++;

    METRICS.clicks.all_clicks.push({ x: e.clientX, y: e.clientY, t });

    if (METRICS.clicks.all_clicks.length > 1) {
        let prev = METRICS.clicks.all_clicks.at(-2);
        METRICS.clicks.click_intervals_ms.push(t - prev.t);
    }
});


//-----------------------------------------------------------
// LETTER CLICK REGISTRATION
//-----------------------------------------------------------
METRICS.registerLetterClick = (letter, x, y, cx, cy) => {
    METRICS.clicks.picked_letters.push({
        letter,
        x,
        y,
        cx,
        cy,
        t: performance.now()
    });
};




//-----------------------------------------------------------
// FINAL DATA PACKAGE
//-----------------------------------------------------------
window.collectFinalMetrics = () => {

    METRICS.timings.total_solve_time_ms = performance.now() - window.challenge_start_time;

    //----------------------------------------
    // compute mouse path metrics
    //----------------------------------------
    let totalDist = 0;
    let last = null;
    let idle = 0;
    let speeds = [];
    let direction_changes = 0;
    let lastDx = null;
    let lastDy = null;

    for(const p of METRICS.mouse.path){

        if (last){

            // path length
            let dx = p.x - last.x;
            let dy = p.y - last.y;
            let dist = Math.hypot(dx,dy);
            totalDist += dist;

            // speed
            let dt = p.t - last.t;
            if(dt > 0){
                let speed = dist / dt; // px/ms
                speeds.push(speed);

                if(speed < 0.01){
                    idle += dt;
                }
            }

            // direction change
            if(lastDx !== null){
                if( Math.sign(dx) !== Math.sign(lastDx) ||
                    Math.sign(dy) !== Math.sign(lastDy))  {
                    direction_changes++;
                }
            }

            lastDx = dx;
            lastDy = dy;
        }

        last = p;
    }

    METRICS.mouse.path_length_px = totalDist;
    METRICS.mouse.idle_time_ms = idle;

    if(speeds.length){
        METRICS.mouse.avg_speed_px_per_ms = speeds.reduce((a,b)=>a+b,0)/speeds.length;
        METRICS.mouse.max_speed_px_per_ms = Math.max(...speeds);

        let mean = METRICS.mouse.avg_speed_px_per_ms;
        METRICS.mouse.speed_variance =
            speeds.reduce((a,b)=>a+(b-mean)*(b-mean),0)/speeds.length;

    }

    METRICS.mouse.direction_changes = direction_changes;


    return METRICS;
};
