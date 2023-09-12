import Chart from 'chart.js/auto'

// set chart font and color
Chart.defaults.font.family = 'Oswald'
Chart.defaults.color = '#000000'

async function generateGraph(axisTitle, axisValues, invHoldingCost, backorderLostsalesCost, orderSetupCost, totalCost, backorder, swapAxes=false) {
    /*
    axisTitle: str - the name of the independent variable (leadtime length, alpha, beta, etc.)
    axisValues: Array[float] - values of the independent variable, such as [0.95, 0.96, 0.97, 0.98, 0.99], for example for alpha
    invHoldingCost: Array[float] - values of inventory holding cost with the same length as axisValues
    backorderLostsalesCost: Array[float] - values of backorder/lost sales cost
    orderSetupCost: Array[float] - values of order setup cost
    totalCost: Array[float] - total cost values
    backorder: bool - whether or not it's backorder
    swapAxes: bool - when true, set cost to the x axis, independent variable to the y axis
    */

    // reset canvas by destroy/creating it
    const chartDiv = document.getElementById('graph-chart')
    const chartCanvas = document.getElementById('graph-chart-canvas')
    chartDiv.removeChild(chartCanvas)

    const newChartCanvas = document.createElement('canvas')
    newChartCanvas.id = 'graph-chart-canvas'
    chartDiv.appendChild(newChartCanvas)

    const chart = new Chart(
        document.getElementById('graph-chart-canvas'), {
            type: 'line',
            data: {
                labels: axisValues,
                datasets: [
                    {
                        label: 'Inventory Holding Cost',
                        data: invHoldingCost
                    },
                    {
                        label: backorder ? 'Backorder Cost' : 'Lost Sales Cost',
                        data: backorderLostsalesCost
                    },
                    {
                        label: 'Order Setup Cost',
                        data: orderSetupCost
                    },
                    {
                        label: 'Total Cost',
                        data: totalCost
                    }
                ]
            },
            options: {
                indexAxis: swapAxes ? 'y' : 'x',
                // from a linear regression...not sure if there's a better way to do this
                aspectRatio: Math.max(0.001181 * window.innerWidth + 0.251, 0.5),
                plugins: {
                    title: {
                        display: true,
                        text: `Cost as a Function of ${axisTitle}`,
                        font: {
                            size: 16
                        }
                    }
                },
                elements: {
                    point: {
                        radius: 2
                    }
                },
                scales: {
                    x: {
                        title: {
                            text: swapAxes ? 'Cost' : axisTitle,
                            display: true
                        }
                    },
                    y: {
                        title: {
                            text: swapAxes ? axisTitle : 'Cost',
                            display: true
                        }
                    }
                }
            }
        }
    )

    return chart
}

export { generateGraph }