class Configuration {
    constructor() {
        this.low_range = 0;
        this.high_range = 1;
        this.selectedDecomposition = "linear";
        this.is_use_csv = false;
    }
}

config = new Configuration()

const LOCALHOST_URL = "http://localhost:8081/";
const socket = io(LOCALHOST_URL);

const userCount = 2; 
const d_users = [];

for (let i = 1; i <= userCount; i++) {
    d_users.push(`model_${i}`);
}


async function fetchAndPlot(url, divId) {
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        const time = data.time;
        const freq = data.freq;
        const power = data.power;

        Plotly.newPlot(divId, [{
            x: time,
            y: freq,
            z: power,
            type: 'heatmap',
            colorscale: 'Jet'
        }], {
            title: divId.replace("_", " "),
            xaxis: { title: "Time (s)" },
            yaxis: { title: "Frequency (Hz)" }
        });
    } catch (error) {
        console.error(`Error fetching ${url}:`, error);
    }
}

fetchAndPlot('http://127.0.0.1:8081/fft_spectrogram', 'fft_spectrogram');
fetchAndPlot('http://127.0.0.1:8081/wavelet_spectrogram', 'wavelet_spectrogram');

const leftPanel = document.getElementById("left-panel");

seleted_user_name = d_users[0]

d_users.forEach(user => {
    const button = document.createElement("button");
    button.id = user + "-btn";
    button.textContent = user.charAt(0).toUpperCase() + user.slice(1); // Capitalize first letter
    button.addEventListener("click", function() {
        seleted_user_name = user
        console.log(user + ' selected');
    });
    leftPanel.appendChild(button);
});

document.addEventListener("DOMContentLoaded", function () {
    const applyButton = document.getElementById("applyButton");

    applyButton.addEventListener("click", function () {
        // Get input values
        low_range = document.getElementById("low_range").value
        high_range = document.getElementById("high_range").value

        if (low_range != '' && low_range != '') {
            config.low_range = low_range
            config.high_range = high_range
        }
        
        config.selectedDecomposition = document.getElementById("decompWaySelect").value

        let config_dict = JSON.parse(JSON.stringify(config));
        console.log(config_dict)
        socket.emit("send_configuration", config_dict);
    });
});

document.getElementById("csv_checkbox").addEventListener("change", function() {
    console.log(this.checked )
    config.is_use_csv = this.checked 
});


const movingAverageWindow = Math.floor(250/30);
const xIncrement = 0.15;
const xMax = 20;
const plotValuePredLimit = 110;
const clfWinLen = 7;

const sectionColors = [
    "rgba(117, 93, 93, 0.62)",
    "rgba(0, 255, 0, 0.98)",
    "rgba(255, 0, 238, 0.2)"
];

const sensorNames = ["af_7", "af_8", "tp_9", "tp_10"];
const waveNames = ["delta", "theta", "alpha", "beta", "gamma"];

// Class to store individual sensor data
class SensorData {
    constructor(name) {
        this.name = name;
        this.values = [];
        this.displayData = new DisplayData();
        this.classification = new ClassificationData();
        this.forecast = [];
        this.decomposition = {};

        waveNames.forEach(wave => {
            this.decomposition[wave] = [];
        });
    }

    updateSensorData(value, forecast, classification) {
        this.values.push(value);
        this.forecast = forecast;
        this.classification.values.push(classification);
    }

    updateDecomposition(wave, value) {
        if (this.decomposition[wave]) {
            this.decomposition[wave] = value;
        }
    }
}

// Class to store display-related data for sensors
class DisplayData {
    constructor() {
        this.xData = [];
        this.yData = [];
        this.preds = [];
        this.avgPreds = [];
        this.mean = [];
    }

    updateXData() {
        if (this.xData.length === 0 || this.xData[this.xData.length - 1] <= xMax) {
            this.xData.push(this.xData.length * xIncrement);
        }
    }

    updateYData(value) {
        this.yData.push(value);
    }

    updateMean(value) {
        this.mean.push(value);
    }
}

// Class to store classification data
class ClassificationData {
    constructor() {
        this.values = [];
        this.displayValues = [];
    }

    updateClassification(value) {
        this.values.push(value);

        // const avgClassification = Math.floor(Math.random() * 3);  // Placeholder logic
        this.displayValues.push(value);
    }
}

// Create instances for each sensor
const sensors = sensorNames.map(name => new SensorData(name));

let decompSensorName = sensorNames[0];

// Custom Background Plugin for Chart.js
let users_dict = {};

d_users.forEach(user => {
    users_dict[user] = {} 

    sensorNames.forEach(sensorName => {
        users_dict[user][sensorName] = new SensorData(sensorName)
    })
});

const backgroundPlugin = {
    id: "backgroundPlugin",
    beforeDraw: (chart) => {
        const { ctx, chartArea: { left, right, top, bottom } } = chart;
        const sectionWidth = 30; // Use column width
        const customId = chart.options.myCustomId;
        const sensor = users_dict[seleted_user_name][customId];

        if (sensor) {
            sensor.classification.displayValues.slice(-15).forEach((item, index) => {
                const startX = left + (index * sectionWidth);
                ctx.fillStyle = sectionColors[item];
                ctx.fillRect(startX, top, sectionWidth, bottom - top);
            });
        }
    }
};

// Initialize Charts
const charts = sensorNames.map((name, index) => 
    createChart(document.getElementById(`chart${index + 1}`).getContext("2d"), name)
);

const decompCharts = waveNames.map((wave, index) => 
    createChart2(document.getElementById(`decomp_chart${index + 1}`).getContext("2d"), wave, -0.2, 0.3)
);


socket.on("sensor_data", function(data) {
    d_users.forEach(userId => {
        user_data = data[userId]

        sensorNames.forEach(sensorName => {
            users_dict[userId][sensorName].updateSensorData(user_data[sensorName], user_data["forecasting"][sensorName], user_data["classification"][sensorName]);
            if (user_data[`${sensorName}_mean`] !== undefined) {
                users_dict[userId][sensorName].displayData.updateMean(user_data[`${sensorName}_mean`]);
            }

            waveNames.forEach(wave => {
                const waveKey = `${sensorName}_${wave}`;
                if (user_data[waveKey] !== undefined) {
                    users_dict[userId][sensorName].updateDecomposition(wave, user_data[waveKey]);
                }
            });

            users_dict[userId][sensorName].displayData.updateYData(users_dict[userId][sensorName].values);
            users_dict[userId][sensorName].displayData.updateXData();
            users_dict[userId][sensorName].values = []; // Clear buffer

            if ( users_dict[userId][sensorName].displayData.yData.length % clfWinLen === 0) {
                users_dict[userId][sensorName].classification.updateClassification(user_data["classification"][sensorName]);
            }
        })

    })

    // console.log(users_dict["user_1"]["af_7"].displayData.yData)

});

socket.on("connect", () => console.log("Connected to WebSocket server"));
socket.on("disconnect", () => console.log("Disconnected from WebSocket server"));

// Function to update charts
function updateChart() {
    sensorNames.forEach((sensorName, index) => {
        sensor = users_dict[seleted_user_name][sensorName]
        const chart = charts[index];
        const xData = sensor.displayData.xData;
        const yData = sensor.displayData.yData;
        const avgPreds = sensor.forecast;
        const avgYData = sensor.displayData.mean;
        let offset = yData.length - plotValuePredLimit;
        if (offset < 0) offset = 0;

        chart.data.datasets[0].data = xData.map((x, i) => ({ x, y: yData[i + offset] }));
        chart.data.datasets[1].data = xData.map((x, i) => ({ x, y: avgYData[i + offset] }));

        if (offset > 0) {
            chart.data.datasets[2].data = avgPreds.map((x, i) => ({ x: (plotValuePredLimit + i) * xIncrement, y: avgPreds[i] }));
        }

        chart.update(); 
    })

    decomp_sensor = users_dict[seleted_user_name][decompSensorName]
    console.log(seleted_user_name)
    waveNames.forEach((wave, d_index) => {
        const decompKey = decomp_sensor.decomposition[wave];
        decompCharts[d_index].data.datasets[0].data = decompKey.map((x, i) => ({ x: i, y: x }));
        decompCharts[d_index].update();
    })

    setTimeout(updateChart, 50);
}

// Start updating charts
updateChart();

// Function to create main sensor charts
function createChart(ctx, title) {
    return new Chart(ctx, {
        type: "scatter",
        data: {
            datasets: [
                { label: "Noisy Points", data: [], borderColor: "blue", showLine: false, pointRadius: 3 },
                { label: "Moving Average", data: [], borderColor: "red", borderWidth: 2, showLine: true, pointRadius: 0 },
                { label: "Predictions", data: [], borderColor: "orange", borderWidth: 2, borderDash: [2, 2], pointRadius: 2, showLine: true, tension: 0.4 }
            ]
        },
        plugins: [backgroundPlugin],
        options: {
            animation: false,
            maintainAspectRatio: false,
            myCustomId: title,
            onClick: function() {
                decompSensorName = title;
                document.getElementById("decompSensorLabel").innerText = decompSensorName;
            },
            plugins: { title: { display: true, text: title } },
            scales: { x: { type: "linear", min: 0, max: xMax, ticks: { autoSkip: false, maxTicksLimit: 10 } } }
        }
    });
}

// Function to create decomposition charts
function createChart2(ctx, title, ymin, ymax) {
    return new Chart(ctx, {
        type: "line",
        data: { datasets: [{ label: "Signal", data: [], borderColor: "red", borderWidth: 2, showLine: true, pointRadius: 0 }] },
        options: {
            animation: false,
            maintainAspectRatio: false,
            plugins: { title: { display: true, text: title } },
            scales: { x: { type: "linear", min: 0, max: 300 } }
        }
    });
}
