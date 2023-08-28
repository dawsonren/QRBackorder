import { processFlowCalculations, costCalculations, optimal, alpha, beta } from './calculations.js'
import { generateGraph } from './graph.js'
// import fonts so we don't have to get it from Google Fonts CDN
import '@fontsource/oswald/200.css'
import '@fontsource/oswald/400.css'

/* UI Changes */

function getRawInputs() {
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
    return inputs
}

function cleanInputs(inputs, raiseError=true) {
    // handle cleaning to floats, raise UI error if empty/invalid
    let errorMessage = false

    // convert inputs to float (can't error because type=number in HTML)
    Object.keys(inputs).forEach(k => {
        inputs[k] = parseFloat(inputs[k])
        // error on incorrect input
        if (isNaN(inputs[k])) {
            errorMessage = true
        }
    })

    // set error message for inputs
    if (raiseError) {
        if (errorMessage) {
            document.getElementById('input-error').innerText = 'Inputs incorrectly specified.'
            return
        } else {
            document.getElementById('input-error').innerText = ''
        }
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

function getCleanedInputs() {
    return cleanInputs(getRawInputs())
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
    tbl.classList.add('output-table')
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
        sectionHeaderRow.classList.add('output-table-row-group')
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
            valueCell.classList.add('output-table-result-cell')
            valueCell.appendChild(mapTableValue(value))
            valueRow.appendChild(nameCell)
            valueRow.appendChild(valueCell)
            tblBody.appendChild(valueRow)
        }
    }
  
    tbl.appendChild(tblHead)
    tbl.appendChild(tblBody)
    return tbl
}

function constructTableDataMap(QS, Rs, I, T, TH, turns, invHoldingCost, backorderLostsalesCost, setupCost, totalCost, continuous) {
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
    costs.set('Average Annual Backorder Cost', backorderLostsalesCost)
    costs.set('Average Annual Setup Cost', setupCost)
    costs.set('Total Average Annual Cost', totalCost)

    optTableData.set('Inventory Policy', invPolicy)
    optTableData.set('Process Flow Measures', processFlowMeasures)
    optTableData.set('Costs', costs)
    
    return optTableData
}

function generateTableData(policy, inputs) {
    /*
        processFlow: (Q, R, inputs) => {I, T, TH, turns}
        costCalculations: (Q, R, inputs) => {invHoldingCost, backorderOrCost, setupCost, totalCost}
    */
    const {I, T, TH, turns} = processFlowCalculations(policy, inputs)
    const {invHoldingCost, backorderLostsalesCost, setupCost, totalCost} = costCalculations(policy, inputs)
    const policyParam1 = inputs.continuous ? policy.Q : policy.S
    const policyParam2 = inputs.continuous ? policy.R : policy.s

    return constructTableDataMap(policyParam1, policyParam2, I, T, TH, turns, invHoldingCost, backorderLostsalesCost, setupCost, totalCost, inputs.continuous)
}

function generateTables(inputs) {
    const minTableDiv = document.getElementById('min-table')
    const alphaTableDiv = document.getElementById('alpha-table')
    const betaTableDiv = document.getElementById('beta-table')
    // remove all children
    minTableDiv.textContent = ''
    alphaTableDiv.textContent = ''
    betaTableDiv.textContent = ''

    // min cost
    const minCostPolicy = optimal(inputs)
    const minCostTableData = generateTableData(minCostPolicy, inputs)
    const minCostTable = generateTable('Minimizing Total Average Annual Cost', minCostTableData)
    minTableDiv.appendChild(minCostTable)

    // alpha
    const alphaPolicy = alpha(inputs)
    const alphaTableData = generateTableData(alphaPolicy, inputs)
    const alphaTable = generateTable('Achieving Cycle Service Level', alphaTableData)
    alphaTableDiv.appendChild(alphaTable)

    // beta
    const betaPolicy = beta(inputs)
    const betaTableData = generateTableData(betaPolicy, inputs)
    const betaTable = generateTable('Achieving Fill Rate', betaTableData)
    betaTableDiv.appendChild(betaTable)
}

function arrayToPolicy(policyInput, inputs) {
    if (inputs.continuous) {
        return {
            Q: policyInput[0],
            R: policyInput[1]
        }
    } else {
        return {
            S: policyInput[0],
            s: policyInput[1]
        }
    }
}

function generateRestOfPolicyTable(policyInput, inputs, policyTableDiv, input1, input2) {
    policyTableDiv.innerText = ''
    let policyTableData

    const policy = arrayToPolicy(policyInput, inputs)
    if (isFinite(policyInput[0]) && isFinite(policyInput[1])) {
        const {I, T, TH, turns} = processFlowCalculations(policy, inputs)
        const {invHoldingCost, backorderLostsalesCost, setupCost, totalCost} = costCalculations(policy, inputs)
        policyTableData = constructTableDataMap(input1, input2, I, T, TH, turns, invHoldingCost, backorderLostsalesCost, setupCost, totalCost, inputs.continuous)
    } else {
        // create empty table if not
        policyTableData = constructTableDataMap(input1, input2, '', '', '', '', '', '', '', '', inputs.continuous)
    }
    const policyTable = generateTable('Performance Measures for Given Policy', policyTableData, inputs.continuous)
    policyTableDiv.appendChild(policyTable)
}

function generatePolicyTable(inputs) {
    const policyTableDiv = document.getElementById('policy-table')

    // index 0 is Q or S, index 1 is R or s
    const policyInput = [NaN, NaN]

    const input1 = document.createElement('input')
    const input2 = document.createElement('input')
    input1.classList.add('policy-input')
    input2.classList.add('policy-input')
    input1.addEventListener('change', (e) => {
        policyInput[0] = parseFloat(e.target.value)
        generateRestOfPolicyTable(policyInput, inputs, policyTableDiv, input1, input2)
    })
    input2.addEventListener('change', (e) => {
        policyInput[1] = parseFloat(e.target.value)
        generateRestOfPolicyTable(policyInput, inputs, policyTableDiv, input1, input2)
    })

    generateRestOfPolicyTable(policyInput, inputs, policyTableDiv, input1, input2)
}

function getGraphInputs() {
    const indepVariableEl = document.getElementById('indepVariable')

    return {
        minValue: parseFloat(document.getElementById('minRange').value),
        maxValue: parseFloat(document.getElementById('maxRange').value),
        indepVariableText: indepVariableEl.options[indepVariableEl.selectedIndex].text,
        indepVariableValue: indepVariableEl.value
    }
}

function getCleanedGraphInputs() {
    const graphInputs = getGraphInputs()

    // set error message for graphs
    if (isNaN(graphInputs.minValue) || isNaN(graphInputs.maxValue) || (graphInputs.maxValue <= graphInputs.minValue)) {
        document.getElementById('graph-error').innerText = 'Limits incorrectly specified.'
        return
    } else {
        document.getElementById('graph-error').innerText = ''
    }

    return graphInputs
}

function range(start, stop, step) {
    // simple range function, fully inclusive
    let s = start
    let l = []

    while (s <= stop + step / 2) {
        l.push(parseFloat(s.toFixed(3)))
        s += step
    }

    return l
}

function getAxisForIndepVariable(graphInputs) {
    // Return a list of floats between min and max inputs that's reasonable
    if (['alpha', 'beta'].includes(graphInputs.indepVariableValue)) {
        return range(graphInputs.minValue, graphInputs.maxValue, 0.01)
    } else {
        // we want somewhere between 10 and 100 values, adjust until we get there
        let step = 1
        let diff = graphInputs.maxValue - graphInputs.minValue
        let values = diff / step

        while (values < 10 || values > 100) {
            // adjust step size
            if (values < 10) {
                step /= 10
            } else {
                step *= 10
            }

            // recalculate number of values
            values = diff / step
        }
        return range(graphInputs.minValue, graphInputs.maxValue, step)
    }
}

function getTradeoffData(rawInputs, graphInputs) {
    const axisTitle = graphInputs.indepVariableText
    const axisValues = getAxisForIndepVariable(graphInputs)
    let policies = []
    let invHoldingCosts = []
    let backorderLostsalesCosts = []
    let orderSetupCosts = []
    let totalCosts = []

    // when alpha or beta, use those, otherwise optimal
    const policyFunc = (
        graphInputs.indepVariableValue === 'alpha' ?
            alpha :
            graphInputs.indepVariableValue === 'beta' ?
                beta : optimal
    )

    for (let val of axisValues) {
        // shallow copy, this is fine since all are floats
        let adjustedInputs = {...rawInputs}
        // values in HTML match keys of inputs
        adjustedInputs[graphInputs.indepVariableValue] = val
        adjustedInputs = cleanInputs(adjustedInputs, false)

        const policy = policyFunc(adjustedInputs)
        policies.push(policy)
        const {invHoldingCost, backorderLostsalesCost, setupCost, totalCost} = costCalculations(policy, adjustedInputs)
        invHoldingCosts.push(invHoldingCost)
        backorderLostsalesCosts.push(backorderLostsalesCost)
        orderSetupCosts.push(setupCost)
        totalCosts.push(totalCost)
    }

    return {
        axisTitle,
        axisValues,
        policies,
        invHoldingCosts,
        backorderLostsalesCosts,
        orderSetupCosts,
        totalCosts
    }
}

function generateTradeoffTable(rawInputs, tradeoffData) {
    const {axisTitle, axisValues, policies, invHoldingCosts, backorderLostsalesCosts, orderSetupCosts, totalCosts} = tradeoffData

    // turn list of policies into list of Q/S and R/s
    const policyParam1 = policies.map((policy) => rawInputs.continuous ? policy.Q : policy.S)
    const policyParam2 = policies.map((policy) => rawInputs.continuous ? policy.R : policy.s)

    // construct table values
    let tableValues = []

    for (let i = 0; i < axisValues.length; i++) {
        tableValues.push([
            axisValues[i],
            policyParam1[i],
            policyParam2[i],
            invHoldingCosts[i],
            backorderLostsalesCosts[i],
            orderSetupCosts[i],
            totalCosts[i]
        ])
    }

    // tableData is a map whose contract is specified in generateTableData
    const tbl = document.createElement('table')
    tbl.classList.add('tradeoff-table-table')
    const tblBody = document.createElement('tbody')
    tblBody.classList.add('tradeoff-table-body')

    // create title
    const tblHead = document.createElement('thead')
    const headRow = document.createElement('tr')
    const head = document.createElement('th')
    head.setAttribute('colspan', 7)
    head.appendChild(document.createTextNode(`Cost as a Function of ${axisTitle}`))
    head.classList.add('tradeoff-table-title')
    headRow.appendChild(head)
    tblHead.appendChild(headRow)

    // create header
    const headerRow = document.createElement('tr')

    const headerNames = [
        axisTitle,
        rawInputs.continuous ? 'Optimal Q' : 'Optimal S',
        rawInputs.continuous ? 'Optimal R' : 'Optimal s',
        'Average Inventory Cost',
        rawInputs.backorder ? 'Average Backorder Cost' : 'Average Lost Sales Cost',
        'Average Setup Cost',
        'Total Average Annual Cost'
    ]
    for (let name of headerNames) {
        const header = document.createElement('th')
        header.classList.add('tradeoff-table-header')
        header.appendChild(document.createTextNode(name))
        headerRow.appendChild(header)
    }
    
    tblHead.appendChild(headerRow)

    // insert values
    for (let i = 0; i < axisValues.length; i++) {
        const valueRow = document.createElement('tr')
        valueRow.classList.add('tradeoff-table-data-row')

        for (let value of tableValues[i]) {
            const valueCell = document.createElement('td')
            valueCell.appendChild(document.createTextNode(value.toFixed(2)))
            valueCell.classList.add('tradeoff-table-data')
            valueRow.appendChild(valueCell)
        }
        tblBody.append(valueRow)
    }
  
    tbl.appendChild(tblHead)
    tbl.appendChild(tblBody)
    
    // UI updates
    const tradeoffTableDiv = document.getElementById('tradeoff-table')
    tradeoffTableDiv.textContent = ''
    tradeoffTableDiv.appendChild(tbl)
}

function generateTradeoffGraph(inputs, tradeoffData) {
    // returns the graph object
    const {axisTitle, axisValues, invHoldingCosts, backorderLostsalesCosts, orderSetupCosts, totalCosts} = tradeoffData
    const swapAxes = document.getElementById('swapAxes').checked
    generateGraph(axisTitle, axisValues, invHoldingCosts, backorderLostsalesCosts, orderSetupCosts, totalCosts, inputs.backorder, swapAxes)
}
  
function calculate() {
    // get inputs
    const inputs = getCleanedInputs()
    if (!inputs) { return }

    // generate tables
    generateTables(inputs)
    // You can control (Q, R) or (S, s) on this table
    generatePolicyTable(inputs)

    // generate graph
    showGraph()

    // toggle outputs/tradeoffs
    openCollapsedOutputs()
    openCollapsedTradeoffs()

    // scroll to outputs
    const outputAnchor = document.getElementById('output-anchor')
    outputAnchor.scrollIntoView({
        block: 'end',
        behavior: 'smooth',
        inline: 'center'
    });
}

function rawInputsAreValid(rawInputs) {
    // if any are empty strings, invalid (might need to revisit this later)
    let valid = true
    Object.values(rawInputs).forEach((input) => {
        if (input === '') {
            valid = false
        }
    })

    return valid
}

function showGraph() {
    // get inputs
    const rawInputs = getRawInputs()
    if (!rawInputsAreValid(rawInputs)) { return }
    const graphInputs = getCleanedGraphInputs()
    if (!graphInputs) { return }

    const tradeoffData = getTradeoffData(rawInputs, graphInputs)

    // generate graph and tradeoff table
    generateTradeoffTable(rawInputs, tradeoffData)
    generateTradeoffGraph(rawInputs, tradeoffData)
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
        const inputContaineinput2s = document.getElementById('input-container-inputs')
        inputContaineinput2s.appendChild(savedReviewPeriodDetailsContainer)
    }
}

// upon pressing 'Calculate Policies'
const submitButton = document.getElementById('input-submit')
submitButton.addEventListener('click', calculate)

// upon pressing 'Display Graph'
const graphButton = document.getElementById('graph-submit')
graphButton.addEventListener('click', showGraph)

const fillButton = document.getElementById('fill')
fillButton.addEventListener('click', fill)

// handles visibility of review period details
let savedReviewPeriodDetailsContainer = document.getElementById('review-period-details-container')
// handle change of visibility
const reviewSelect = document.getElementById('review')
reviewSelect.addEventListener('change', (e) => togglePeriodDetails(e.target.value === 'continuous'))

// handle collapse
const collapseButtons = document.getElementsByClassName('collapsible-container-header')

// second order function
const toggleCollapse = (i) => {
    return (
        function() {
            collapseButtons[i].classList.toggle('collapse-active')
            const content = collapseButtons[i].nextElementSibling
            if (content.style.display === 'block') {
                content.style.display = 'none'
            } else {
                content.style.display = 'block'
            }
        }
    )
}

const openCollapsed = (i) => {
    return (
        function() {
            collapseButtons[i].classList.toggle('collapse-active')
            const content = collapseButtons[i].nextElementSibling
            content.style.display = 'block'
        }
    )
}

const openCollapsedInputs = openCollapsed(0)
const openCollapsedOutputs = openCollapsed(1)
const openCollapsedTradeoffs = openCollapsed(2)

for (let i = 0; i < collapseButtons.length; i++) {
    collapseButtons[i].addEventListener('click', toggleCollapse(i))
}

// onLoad lifecycle code (runs once during first paint)
togglePeriodDetails(true)
openCollapsedInputs()