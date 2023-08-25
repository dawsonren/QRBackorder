/* Mathematical Functions */
function normalCDF(z) {
    return (1 + ss.errorFunction(z / Math.sqrt(2))) / 2
}

function normalPDF(z) {
    return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-(1 / 2) * (z ** 2))
}

function invNormalCDF(p) {
    // Use an approximation from Peter John Acklam, relative error < 10 ** -9
    // https://stackedboxes.org/2017/05/01/acklams-normal-quantile-function/
    const a1 = -39.6968302866538, a2 = 220.946098424521, a3 = -275.928510446969
    const a4 = 138.357751867269, a5 = -30.6647980661472, a6 = 2.50662827745924
    const b1 = -54.4760987982241, b2 = 161.585836858041, b3 = -155.698979859887
    const b4 = 66.8013118877197, b5 = -13.2806815528857, c1 = -7.78489400243029E-03
    const c2 = -0.322396458041136, c3 = -2.40075827716184, c4 = -2.54973253934373
    const c5 = 4.37466414146497, c6 = 2.93816398269878, d1 = 7.78469570904146E-03
    const d2 = 0.32246712907004, d3 = 2.445134137143, d4 = 3.75440866190742
    const p_low = 0.02425, p_high = 1 - p_low
    let q, r

    if ((p < 0) || (p > 1)) { return NaN }

    if (p < p_low) {
        q = Math.sqrt(-2 * Math.log(p))
        return (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) / ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
    } else if (p <= p_high) {
        q = p - 0.5
        r = q * q
        return (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q / (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1)
    } else {
        q = Math.sqrt(-2 * Math.log(1 - p))
        return -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) / ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
    }
}

function standardNormalLoss(z) {
    return normalPDF(z) - z + z * normalCDF(z)
}

function invStandardNormalLoss(l) {
    // Use a log-polynomial approximation from
    // https://www.researchgate.net/profile/Claudia-Sikorski-2/publication/303854357_Numerical_Approximation_of_the_Inverse_Standardized_Loss_Function_for_Inventory_Control_Subject_to_Uncertain_Demand/links/5758251908ae5c6549075691/Numerical-Approximation-of-the-Inverse-Standardized-Loss-Function-for-Inventory-Control-Subject-to-Uncertain-Demand.pdf
    // The absolute error is at most 3 * 10 ** -4, which admittedly isn't great
    // The mean error is 10 ** -14, and the highest errors occur at extreme values
    
    // TODO: Find another way to approximate this well/use binary search on the monotonic function, as
    // the error is unacceptably high for low fill rates (< 50%) compared to goal-seek in the spreadsheet!
    x = Math.log(l)
    z = (4.41738119e-09*x**12  + 1.79200966e-07*x**11
         +3.01634229e-06*x**10 + 2.63537452e-05*x**9
         +1.12381749e-04*x**8  + 5.71289020e-06*x**7
         -2.64198510e-03*x**6  - 1.59986142e-02*x**5
         -5.60399292e-02*x**4  - 1.48968884e-01*x**3
         -3.68776346e-01*x**2  - 1.22551895e+00*x**1
         -8.99375602e-01)
    return z
}

/* Utility Functions */

function continuousProcessFlowCalculations(Q, R, inputs) {
    const avgLossPerCycle = continuousFindAvgLostPerCycle(inputs, R)
    const annualDemand = inputs.numDaysPerYear * inputs.demandMean

    const avgInv = Q / 2 + R - inputs.leadtimeDemandMean
    // lost sales?
    if (!inputs.backorder) {
        avgInv += avgLossPerCycle
    }
    const avgFlowTime = avgInv / annualDemand * inputs.numDaysPerYear
    const avgThroughput = avgInv / avgFlowTime
    const avgInvTurns = 365 / avgFlowTime
    return {
        I: avgInv,
        T: avgFlowTime,
        TH: avgThroughput,
        turns: avgInvTurns
    }
}

function periodicProcessFlowCalculations(S, s, inputs) {
    const avgLossPerCycle = periodicFindAvgLostPerCycle(inputs, S)
    let avgInv = inputs.periodDemandMean / 2 + S - inputs.leadtimePeriodDemandMean
    // lost sales?
    if (!inputs.backorder) {
        avgInv += avgLossPerCycle
    }
}

function continuousFindAvgLostPerCycle(inputs, R) {
    const z = (R - inputs.leadtimeDemandMean) / inputs.leadtimeDemandStdDev
    return inputs.leadtimeDemandStdDev * standardNormalLoss(z)
}

function periodicFindAvgLostPerCycle(inputs, S) {
    const z = (S - inputs.leadtimePeriodDemandMean) / inputs.leadtimePeriodDemandStdDev
    return inputs.leadtimePeriodDemandStdDev * standardNormalLoss(z)
}

function findRFromQ(inputs, Q) {
    let denom = inputs.backorderLostsalesCost * inputs.annualDemand
    // lost sales?
    if (!inputs.backorder) {
        denom += inputs.holdingCost * Q
    }
    const z = invNormalCDF(1 - (inputs.holdingCost * Q / denom))
    return inputs.leadtimeDemandMean + inputs.leadtimeDemandStdDev * z
}

function continuousCostCalculations(Q, R, inputs) {
    const avgLossPerCycle = continuousFindAvgLostPerCycle(inputs, R)
    const ordersPerYear = inputs.annualDemand / Q
    let avgInv = Q / 2 + R - inputs.leadtimeDemandMean
    // lost sales?
    if (!inputs.backorder) {
        avgInv += avgLossPerCycle
    }

    const invHoldingCost = avgInv * inputs.holdingCost
    const backorderCost = inputs.backorderLostsalesCost * avgLossPerCycle * ordersPerYear
    const setupCost = inputs.orderSetupCost * ordersPerYear
    const totalCost = invHoldingCost + backorderCost + setupCost

    return {
        invHoldingCost,
        backorderCost,
        setupCost,
        totalCost
    }
}

function periodicCostCalculations(S, s, inputs) {
    const avgLossPerPeriod = periodicFindAvgLostPerCycle(inputs, S)
    const ordersPerYear = 365 / self.reviewPeriod
    let avgInv = inputs.periodDemandMean / 2 + S - inputs.leadtimePeriodDemandMean
    if (!inputs.backorder) {
        avgInv += periodicFindAvgLostPerCycle(inputs, S)
    }

    const invHoldingCost = avgInv * inputs.holdingCost
    const backorderCost = inputs.backorderLostsalesCost * avgLossPerPeriod * ordersPerYear
    const setupCost = (inputs.orderSetupCost + inputs.invReviewCost) * ordersPerYear
    const totalCost = invHoldingCost + backorderCost + setupCost

    return {
        invHoldingCost,
        backorderCost,
        setupCost,
        totalCost
    }
}

function optimalContinuous(inputs) {
    // Use iterative approach (p. 434 in Iravani's textbook)
    const abs_tol = 10 ** -5
    const max_iters = 10

    // Step 0
    let Q_old = Math.sqrt(2 * inputs.orderSetupCost * inputs.annualDemand / inputs.holdingCost)
    let R_old = findRFromQ(inputs, Q_old)
    let iters = 0

    while (true) {
        iters += 1

        // Step 1
        let backorderLostsalesLoss = inputs.backorderLostsalesCost * continuousFindAvgLostPerCycle(inputs, R_old)
        let Q_new = Math.sqrt(2 * inputs.annualDemand * (inputs.orderSetupCost + backorderLostsalesLoss) / inputs.holdingCost)
        let R_new = findRFromQ(inputs, Q_new)

        // Step 2
        if ((iters >= max_iters) || ((Math.abs(Q_old - Q_new) <= abs_tol) && (Math.abs(R_old - R_new) <= abs_tol))) {
            return {
                Q: Q_new,
                R: R_new
            }
        } else {
            Q_old = Q_new
            R_old = R_new
        }
    }
}

function optimalS(inputs) {
    const denom = inputs.backorderLostsalesCost
    if (!inputs.backorder) {
        denom += inputs.holdingCost * inputs.periodsPerYear
    }
    const p = 1 - (inputs.holdingCost / denom) * inputs.periodsPerYear
    const S = inputs.leadtimePeriodDemandMean + inputs.leadtimePeriodDemandStdDev * invNormalCDF(p)
    return {
        S: S,
        s: S
    }
}

function optimalSs(inputs) {
    const {Q, R} = optimalContinuous(inputs)
    return {
        S: R + Q,
        s: R
    }
}

function optimalPeriodic(inputs) {
    return inputs.orderSetupCost > 0 ? optimalSs(inputs) : optimalS(inputs)
}

function alphaContinuous(inputs) {
    const R = inputs.leadtimeDemandMean + invNormalCDF(inputs.alpha) * inputs.leadtimeDemandStdDev
    const backorderLostsalesLoss = inputs.backorderLostsalesCost * continuousFindAvgLostPerCycle(inputs, R)
    const Q = Math.sqrt(2 * inputs.annualDemand * (inputs.orderSetupCost + backorderLostsalesLoss) / inputs.holdingCost)
    return {Q, R}
}

function betaContinuous(inputs) {
    const Q = Math.sqrt(2 * inputs.orderSetupCost * inputs.annualDemand / inputs.holdingCost)
    let denom = inputs.leadtimeDemandStdDev
    if (!inputs.backorder) {
        denom *= inputs.beta
    }
    const z = invStandardNormalLoss((1 - inputs.beta) * Q / denom)
    const R = inputs.leadtimeDemandMean + inputs.leadtimeDemandStdDev * z
    return {Q, R}
}

function alphaPeriodic(inputs) {
    // assume that K = 0
    const z = invNormalCDF(inputs.alpha)
    const S = inputs.leadtimePeriodDemandMean + inputs.leadtimePeriodDemandStdDev * z
    return {
        S: S,
        s: S
    }
}

function betaPeriodic(inputs) {
    // assume that K = 0
    const loss = (1 - inputs.beta) * inputs.leadtimePeriodDemandMean / inputs.leadtimePeriodDemandStdDev
    return invStandardNormalLoss(loss)
}

/* UI Changes */

function getInputs() {
    const inputs = {
        numDaysPerYear: document.getElementById('numDaysPerYear').value,
        demandMean: document.getElementById('demandMean').value,
        demandStdDev: document.getElementById('demandStdDev').value,
        leadtimeMean: document.getElementById('leadtimeMean').value,
        leadtimeStdDev: document.getElementById('leadtimeStdDev').value,
        purchasePrice: document.getElementById('purchasePrice').value,
        orderSetupCost: document.getElementById('orderSetupCost').value,
        backorderLostsalesCost: document.getElementById('backorderLostsalesCost').value,
        invCarryingRate: document.getElementById('invCarryingRate').value / 100,
        alpha: document.getElementById('alpha').value / 100,
        beta: document.getElementById('beta').value / 100,
        // 0/1 serve as booleans
        backorder: document.getElementById('backorderOrLostSales').value === 'backorder' ? 1 : 0,
        continuous: document.getElementById('review').value === 'continuous' ? 1 : 0,
        // 0s serve as null values
        reviewPeriod: document.getElementById('reviewPeriod') ? document.getElementById('reviewPeriod').value : 0,
        invReviewCost: document.getElementById('invReviewCost') ? document.getElementById('invReviewCost').value : 0
    }

    // perform other useful calculations
    inputs['leadtimeDemandMean'] = inputs.demandMean * inputs.leadtimeMean
    inputs['leadtimeDemandStdDev'] = Math.sqrt(
        inputs.leadtimeMean * inputs.demandStdDev ** 2 +
        inputs.demandMean ** 2 * inputs.leadtimeStdDev ** 2
        )
    inputs['leadtimePeriodDemandMean'] = inputs.demandMean * (inputs.leadtimeMean + inputs.reviewPeriod)
    inputs['leadtimePeriodDemandStdDev'] = Math.sqrt(
        (inputs.leadtimeMean + inputs.reviewPeriod) * inputs.demandStdDev ** 2 +
        inputs.demandMean ** 2 * inputs.leadtimeStdDev ** 2
        )
    inputs['periodDemandMean'] = inputs.demandMean * inputs.reviewPeriod
    inputs['annualDemand'] = inputs.numDaysPerYear * inputs.demandMean
    inputs['holdingCost'] = inputs.purchasePrice * inputs.invCarryingRate
    inputs['periodsPerYear'] = 365 / inputs.reviewPeriod

    return inputs
}

function mapTableValue(x) {
    // of type Node or string
    if (typeof x === 'object') {
        return x
    } else if (typeof x === 'string') {
        return document.createTextNode(x)
    } else {
        // assume float, round to 2 decimal places
        return document.createTextNode(x.toFixed(2))
    }
}

function generateTable(tableHeaderText, tableData) {
    // tableData is a map whose contract is specified in generateTableData
    const tbl = document.createElement('table')
    const tblBody = document.createElement('tbody')

    // create header
    const tblHead = document.createElement('thead')
    const headRow = document.createElement('tr')
    const head = document.createElement('th')
    head.setAttribute('colspan', 2)
    head.appendChild(document.createTextNode(tableHeaderText))
    head.classList.add('output-table-header')
    headRow.appendChild(head)
    tblHead.appendChild(headRow)

    for (const [sectionHeaderText, sectionHeaderData] of tableData.entries()) {
        // create section header
        const sectionHeaderRow = document.createElement('tr')
        const sectionHeader = document.createElement('td')
        sectionHeader.setAttribute('colspan', 2)
        sectionHeader.appendChild(document.createTextNode(sectionHeaderText))
        sectionHeader.classList.add('output-table-section-header')
        sectionHeaderRow.appendChild(sectionHeader)
        tblBody.appendChild(sectionHeaderRow)

        for (const [name, value] of sectionHeaderData.entries()) {
            const valueRow = document.createElement('tr')
            const nameCell = document.createElement('td')
            const valueCell = document.createElement('td')
            nameCell.appendChild(document.createTextNode(name))
            valueCell.appendChild(mapTableValue(value))
            valueRow.appendChild(nameCell)
            valueRow.appendChild(valueCell)
            tblBody.append(valueRow)
        }
    }
  
    tbl.appendChild(tblHead)
    tbl.appendChild(tblBody)
    return tbl
}

function constructTableDataMap(QS, Rs, I, T, TH, turns, invHoldingCost, backorderCost, setupCost, totalCost, continuous) {
    // QS is Q or S, Rs is R or s
    // continuous is a boolean for whether or not the problem is continuous
    const optTableData = new Map()

    const invPolicy = new Map()
    invPolicy.set(continuous ? 'Optimal Order Quantity Q = ' : 'Order Up To Level S = ', QS)
    invPolicy.set(continuous ? 'Optimal Reorder Point R = ' : 'Reorder Point s = ', Rs)

    const processFlowMeasures = new Map()
    processFlowMeasures.set('Average Inventory I = ', I)
    processFlowMeasures.set('Average Flow Time T = ', T)
    processFlowMeasures.set('Throughput TH = ', TH)
    processFlowMeasures.set('Inventory Turn = ', turns)

    const costs = new Map()
    costs.set('Average Annual Inventory Cost', invHoldingCost)
    costs.set('Average Annual Backorder Cost', backorderCost)
    costs.set('Average Annual Setup Cost', setupCost)
    costs.set('Total Average Annual Cost', totalCost)

    optTableData.set('Inventory Policy', invPolicy)
    optTableData.set('Process Flow Measures', processFlowMeasures)
    optTableData.set('Costs', costs)
    
    return optTableData
}

function generateTableData(QS, Rs, processFlow, costCalculations, inputs) {
    /*
        processFlow: (Q, R, inputs) => {I, T, TH, turns}
        costCalculations: (Q, R, inputs) => {invHoldingCost, backorderOrCost, setupCost, totalCost}
    */
    const {I, T, TH, turns} = processFlow(QS, Rs, inputs)
    const {invHoldingCost, backorderCost, setupCost, totalCost} = costCalculations(QS, Rs, inputs)

    return constructTableDataMap(QS, Rs, I, T, TH, turns, invHoldingCost, backorderCost, setupCost, totalCost)
}

function generateTables(inputs) {
    const minTableDiv = document.getElementById('min-table')
    const alphaTableDiv = document.getElementById('alpha-table')
    const betaTableDiv = document.getElementById('beta-table')
    // remove all children
    minTableDiv.textContent = ''
    alphaTableDiv.textContent = ''
    betaTableDiv.textContent = ''

    // TODO: change process flow and cost calculations

    // min cost
    const minCost = optimalContinuous(inputs)
    const minCostTableData = generateTableData(minCost.Q, minCost.R, continuousProcessFlowCalculations, continuousCostCalculations, inputs)
    const minCostTable = generateTable('Minimizing Total Average Annual Cost', minCostTableData)
    minTableDiv.appendChild(minCostTable)

    // alpha
    const alpha = alphaContinuous(inputs)
    const alphaTableData = generateTableData(alpha.Q, alpha.R, continuousProcessFlowCalculations, continuousCostCalculations, inputs)
    const alphaTable = generateTable('Achieving Cycle Service Level, Alpha', alphaTableData)
    alphaTableDiv.appendChild(alphaTable)

    // beta
    const beta = betaContinuous(inputs)
    const betaTableData = generateTableData(beta.Q, beta.R, continuousProcessFlowCalculations, continuousCostCalculations, inputs)
    const betaTable = generateTable('Achieving Fill Rate, Beta', betaTableData)
    betaTableDiv.appendChild(betaTable)
}

function generateRestOfQRTable(userQR, inputs, qrTableDiv, qInput, rInput) {
    qrTableDiv.innerText = ''
    let qrTableData
    if (isFinite(userQR.Q) && isFinite(userQR.R)) {
        const {Q, R} = userQR
        const {I, T, TH, turns} = continuousProcessFlowCalculations(Q, R, inputs)
        const {invHoldingCost, backorderCost, setupCost, totalCost} = continuousCostCalculations(Q, R, inputs)
        qrTableData = constructTableDataMap(qInput, rInput, I, T, TH, turns, invHoldingCost, backorderCost, setupCost, totalCost)
    } else {
        // create empty table if not
        qrTableData = constructTableDataMap(qInput, rInput, '', '', '', '', '', '', '', '')
    }
    const qrTable = generateTable('Performance Measures for Given Policy', qrTableData)
    qrTableDiv.appendChild(qrTable)
}

function generateQRTable(inputs) {
    const qrTableDiv = document.getElementById('qr-table')

    const userQR = {Q: NaN, R: NaN}

    const qInput = document.createElement('input')
    const rInput = document.createElement('input')
    qInput.classList.add('qr-input')
    rInput.classList.add('qr-input')
    qInput.addEventListener('change', (e) => {
        userQR.Q = parseFloat(e.target.value)
        generateRestOfQRTable(userQR, inputs, qrTableDiv, qInput, rInput)
    })
    rInput.addEventListener('change', (e) => {
        userQR.R = parseFloat(e.target.value)
        generateRestOfQRTable(userQR, inputs, qrTableDiv, qInput, rInput)
    })

    generateRestOfQRTable(userQR, inputs, qrTableDiv, qInput, rInput)
}
  
function calculate() {
    const inputs = getInputs()
    let errorMessage = false

    // convert inputs to float (errorless because type=number in HTML)
    Object.keys(inputs).forEach(k => {
        inputs[k] = parseFloat(inputs[k])
        // error on incorrect input
        if (isNaN(inputs[k])) {
            errorMessage = true
        }
    })

    // set error message for inputs
    if (errorMessage) {
        document.getElementById('input-error').innerText = 'Inputs incorrectly specified.'
        return
    } else {
        document.getElementById('input-error').innerText = ''
    }

    // generate tables
    generateTables(inputs)
    generateQRTable(inputs)

    // scroll to outputs
    const outputAnchor = document.getElementById('output-anchor')
    outputAnchor.scrollIntoView({
        block: 'end',
        behavior: 'smooth',
        inline: 'center'
    });
}

function fill() {
    document.getElementById('numDaysPerYear').value = 360
    document.getElementById('demandMean').value = 3
    document.getElementById('demandStdDev').value = 1
    document.getElementById('leadtimeMean').value = 3
    document.getElementById('leadtimeStdDev').value = 1
    document.getElementById('purchasePrice').value = 5
    document.getElementById('orderSetupCost').value = 100
    document.getElementById('backorderLostsalesCost').value = 2
    document.getElementById('invCarryingRate').value = 20
    document.getElementById('alpha').value = 90
    document.getElementById('beta').value = 95
    if (document.getElementById('reviewPeriod')) {
        document.getElementById('reviewPeriod').value = 30
    }
    if (document.getElementById('invReviewCost')) {
        document.getElementById('invReviewCost').value = 10
    }
}

function togglePeriodDetails(continuous) {
    const reviewPeriodDetailsContainer = document.getElementById('review-period-details-container')
    if (continuous) {
        savedReviewPeriodDetailsContainer = reviewPeriodDetailsContainer
        reviewPeriodDetailsContainer.remove()
    } else {
        const inputContainerInputs = document.getElementById('input-container-inputs')
        inputContainerInputs.appendChild(savedReviewPeriodDetailsContainer)
    }
}

// upon pressing 'Calculate Policies'
const submitButton = document.getElementById('input-submit')
submitButton.addEventListener('click', calculate)

const fillButton = document.getElementById('fill')
fillButton.addEventListener('click', fill)

// handles visibility of review period details
let savedReviewPeriodDetailsContainer = document.getElementById('review-period-details-container')
// toggle at beginning, I get why we need lifecycle methods now...
togglePeriodDetails(true)
// handle change of visibility
const reviewSelect = document.getElementById('review')
reviewSelect.addEventListener('change', (e) => togglePeriodDetails(e.target.value === 'continuous'))