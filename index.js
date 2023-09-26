import writeXlsxFile from 'write-excel-file'
import { processFlowCalculations, costCalculations, optimal, alpha, beta, cycleServiceLevel, fillRate } from './calculations.js'
import { generateGraph } from './graph.js'
// import fonts so we don't have to get it from Google Fonts CDN
import '@fontsource/oswald/200.css'
import '@fontsource/oswald/400.css'

/* UI Changes */

function getRawInputs() {
    const inputs = {
        numPeriodsPerYear: document.getElementById('numPeriodsPerYear').value,
        demandMean: document.getElementById('demandMean').value,
        demandStdDev: document.getElementById('demandStdDev').value,
        leadtimeMean: document.getElementById('leadtimeMean').value,
        leadtimeStdDev: document.getElementById('leadtimeStdDev').value,
        purchasePrice: document.getElementById('purchasePrice').value,
        orderSetupCost: document.getElementById('orderSetupCost').value,
        backorderLostsalesCost: document.getElementById('backorderLostsalesCost').value,
        invCarryingRate: document.getElementById('invCarryingRate').value / 100,
        // -1s serve as null values
        alpha: document.getElementById('alpha') ? document.getElementById('alpha').value / 100 : -1,
        beta: document.getElementById('beta') ? document.getElementById('beta').value / 100 : -1,
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
    inputs['annualDemand'] = inputs.numPeriodsPerYear * inputs.demandMean
    inputs['holdingCost'] = inputs.purchasePrice * inputs.invCarryingRate
    inputs['periodsPerYear'] = inputs.numPeriodsPerYear / inputs.reviewPeriod
    // is an eoq model?
    inputs['eoq'] = inputs.continuous && inputs.demandStdDev === 0 && inputs.leadtimeStdDev === 0
    // is an order-up-to model?
    inputs['S'] = !inputs.continuous && inputs.orderSetupCost === 0

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

function generateTooltip(text, tooltipText) {
    const wrapper = document.createElement('div')
    wrapper.classList.add('tooltip')

    const content = document.createElement('span')
    content.classList.add('tooltip-highlight')
    content.appendChild(document.createTextNode(text))

    const tooltip = document.createElement('span')
    tooltip.classList.add('tooltip-text-above')
    tooltip.appendChild(document.createTextNode(tooltipText))

    wrapper.appendChild(content)
    wrapper.appendChild(tooltip)

    return wrapper
}

const tableNameToTooltipText = {
    'Order Quantity Q = ': 'The number of units that must be ordered each time.',
    'Reorder Point R = ': 'The reorder point. An order must be placed when the inventory position reaches this value.',
    'Order Up To Level S = ': 'The level of inventory to order up to. The inventory order equals the difference between this value and the current level of inventory.',
    'Reorder Point s = ': 'The reorder point. If inventory is below this value during inventory review, we reorder. Otherwise, we do not.',
    'Average Inventory I = ': 'The average annual quantity remaining in inventory.',
    'Average Flow Time T = ': 'The average duration a product stays in inventory in units of time.',
    'Throughput TH = ': 'The average number of products going through the inventory in units of time.',
    'Inventory Turn = ': 'The number of times the inventory replenishes in a year.',
    'Average Annual Inventory Cost': 'The costs associated with holding the inventory.',
    'Average Annual Backorder/Lost Sales Cost': 'The costs associated with  not satisfying a customer order (loss of profit, loss of goodwill, cost of having backorders)',
    'Average Annual Setup Cost': 'The costs of ordering and transportation.',
    'Total Average Annual Cost': 'The sum of average annual inventory, backorder/lost sales and order setup cost.',
    'Cycle Service Level': 'The probability of not facing shortage in an order cycle.',
    'Fill Rate': 'The fraction of demand that is satisfied immediately.'
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
        const sectionHeader = document.createElement('td')
        sectionHeader.setAttribute('colspan', 2)
        sectionHeader.appendChild(document.createTextNode(sectionHeaderText))
        sectionHeader.classList.add('output-table-section-header')
        sectionHeaderRow.appendChild(sectionHeader)
        tblBody.appendChild(sectionHeaderRow)

        for (const [name, value] of sectionHeaderData.entries()) {
            const valueRow = document.createElement('tr')
            valueRow.classList.add('output-table-data-row')
            const nameCell = document.createElement('td')
            const valueCell = document.createElement('td')
            nameCell.appendChild(generateTooltip(name, tableNameToTooltipText[name]))
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

function constructTableDataMap(QS, Rs, I, T, TH, turns, invHoldingCost, backorderLostsalesCost, setupCost, totalCost, includeServiceLevels, inputs, isMinCost=false) {
    // QS is Q or S, Rs is R or s
    // continuous is a boolean for whether or not the problem is continuous
    const optTableData = new Map()

    const invPolicy = new Map()
    invPolicy.set(inputs.continuous ? 'Order Quantity Q = ' : 'Order Up To Level S = ', QS)
    if (inputs.continuous || isMinCost) {
        invPolicy.set(inputs.continuous ? 'Reorder Point R = ' : 'Reorder Point s = ', Rs)
    }

    const processFlowMeasures = new Map()
    processFlowMeasures.set('Average Inventory I = ', I)
    processFlowMeasures.set('Average Flow Time T = ', T)
    processFlowMeasures.set('Throughput TH = ', TH)
    processFlowMeasures.set('Inventory Turn = ', turns)

    const costs = new Map()
    costs.set('Average Annual Inventory Cost', invHoldingCost)
    costs.set('Average Annual Backorder/Lost Sales Cost', backorderLostsalesCost)
    costs.set('Average Annual Setup Cost', setupCost)
    costs.set('Total Average Annual Cost', totalCost)

    let serviceLevels = new Map()
    if (includeServiceLevels) {
        let policy
        if (typeof QS === 'object') {
            policy = inputs.continuous ? {Q: parseFloat(QS.value), R: parseFloat(Rs.value)} : {S: parseFloat(QS.value), s: parseFloat(Rs.value)}
        } else {
            policy = inputs.continuous ? {Q: QS, R: Rs} : {S: QS, s: Rs}
        }
        
        const empty = I === ''
        serviceLevels.set('Cycle Service Level', !empty ? cycleServiceLevel(policy, inputs) : '')
        serviceLevels.set('Fill Rate', !empty ? fillRate(policy, inputs) : '')
    }

    optTableData.set('Inventory Policy', invPolicy)
    optTableData.set('Process Flow Measures', processFlowMeasures)
    optTableData.set('Costs', costs)
    if (includeServiceLevels) {
        optTableData.set('Service Levels', serviceLevels)
    }
    
    return optTableData
}

function generateTableData(policy, inputs, includeServiceLevels=false, isMinCost=false) {
    /*
        processFlow: (Q, R, inputs) => {I, T, TH, turns}
        costCalculations: (Q, R, inputs) => {invHoldingCost, backorderOrCost, setupCost, totalCost}
    */
    const {I, T, TH, turns} = processFlowCalculations(policy, inputs)
    const {invHoldingCost, backorderLostsalesCost, setupCost, totalCost} = costCalculations(policy, inputs)
    const policyParam1 = inputs.continuous ? policy.Q : policy.S
    const policyParam2 = inputs.continuous ? policy.R : policy.s

    return constructTableDataMap(policyParam1, policyParam2, I, T, TH, turns, invHoldingCost, backorderLostsalesCost, setupCost, totalCost, includeServiceLevels, inputs, isMinCost)
}

function generateTables(inputs) {
    let tables = []

    // min cost
    const minTableDiv = document.createElement('div')
    minTableDiv.classList.add('min-table')
    const minCostPolicy = optimal(inputs)
    const minCostTableData = generateTableData(minCostPolicy, inputs, true, true)
    const minCostTable = generateTable('Minimizing Total Average Annual Cost', minCostTableData)
    minTableDiv.appendChild(minCostTable)
    minTableDiv.classList.add('output-table-div')
    tables.push(minTableDiv)

    // alpha
    if ((inputs.alpha < 1) && (inputs.alpha > 0)) {
        const alphaTableDiv = document.createElement('div')
        alphaTableDiv.classList.add('alpha-table')
        const alphaPolicy = alpha(inputs)
        const alphaTableData = generateTableData(alphaPolicy, inputs)
        const alphaTable = generateTable(`Achieving Cycle Service Level = ${inputs.alpha}`, alphaTableData)
        alphaTableDiv.appendChild(alphaTable)
        alphaTableDiv.classList.add('output-table-div')
        tables.push(alphaTableDiv)
    }

    // beta
    if ((inputs.beta < 1) && (inputs.beta > 0)) {
        const betaTableDiv = document.createElement('div')
        betaTableDiv.classList.add('beta-table')
        const betaPolicy = beta(inputs)
        const betaTableData = generateTableData(betaPolicy, inputs)
        const betaTable = generateTable(`Achieving Fill Rate = ${inputs.beta}`, betaTableData)
        betaTableDiv.appendChild(betaTable)
        betaTableDiv.classList.add('output-table-div')
        tables.push(betaTableDiv)
    }

    return tables
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

function generateRestOfPolicyTable(policyInput, inputs, input1, input2) {
    let policyTableData

    const policy = arrayToPolicy(policyInput, inputs)
    // we only use the second input (policyInput[1]) for (Q, R) policies for continuous
    // when we specify periodic policies, we only use the first input, for the (S) policy.
    if (isFinite(policyInput[0]) && (isFinite(policyInput[1]) || !inputs.continuous)) {
        const {I, T, TH, turns} = processFlowCalculations(policy, inputs)
        const {invHoldingCost, backorderLostsalesCost, setupCost, totalCost} = costCalculations(policy, inputs)
        policyTableData = constructTableDataMap(input1, input2, I, T, TH, turns, invHoldingCost, backorderLostsalesCost, setupCost, totalCost, true, inputs)
    } else {
        // create empty table if not
        policyTableData = constructTableDataMap(input1, input2, '', '', '', '', '', '', '', '', true, inputs)
    }
    return generateTable('Performance Measures for Given Policy', policyTableData, inputs.continuous)
}

function generatePolicyTable(inputs) {
    // index 0 is Q or S, index 1 is R or s
    const policyInput = [NaN, NaN]

    const policyTableDiv = document.createElement('div')
    policyTableDiv.classList.add('output-table-div')

    const input1 = document.createElement('input')
    input1.classList.add('policy-input')
    input1.addEventListener('change', (e) => {
        policyInput[0] = parseFloat(e.target.value)
        policyTableDiv.textContent = ''
        policyTableDiv.appendChild(generateRestOfPolicyTable(policyInput, inputs, input1, input2))
    })
    const input2 = document.createElement('input')
    input2.classList.add('policy-input')
    input2.addEventListener('change', (e) => {
        policyInput[1] = parseFloat(e.target.value)
        policyTableDiv.textContent = ''
        policyTableDiv.appendChild(generateRestOfPolicyTable(policyInput, inputs, input1, input2))
    })

    policyTableDiv.appendChild(generateRestOfPolicyTable(policyInput, inputs, input1, input2))
    return policyTableDiv
}

function generateAllTables(inputs) {
    // create tables programmatically and get a list of HTML nodes
    // based on length of this list, decide how to format
    let tables = []

    tables.push(generatePolicyTable(inputs), ...generateTables(inputs))

    // remove all content for tables
    const tableDiv = document.getElementById('output-tables')
    tableDiv.classList.add('output-tables')
    tableDiv.textContent = ''

    for (let table of tables) {
        tableDiv.appendChild(table)
    }
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
    let span = graphInputs.maxValue - graphInputs.minValue
    // handle when range is non-sensical
    if (span <= 0) {
        return range(graphInputs.minValue, graphInputs.minValue, 1)
    }
    const step = 10 ** (Math.floor(Math.log10(span)) - 1)
    return range(graphInputs.minValue, graphInputs.maxValue, step)
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
    head.appendChild(document.createTextNode(`Average Annual Cost as a Function of ${axisTitle}`))
    head.classList.add('tradeoff-table-title')
    headRow.appendChild(head)
    tblHead.appendChild(headRow)

    // create header
    const headerRow = document.createElement('tr')

    const headerNames = [
        axisTitle,
        rawInputs.continuous ? 'Q' : 'S',
        rawInputs.continuous ? 'R' : 's',
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
            valueCell.appendChild(document.createTextNode(parseFloat(value.toFixed(3))))
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

function generateOutputText(inputs) {
    const outputExplanation = document.getElementById('output-explanation')
    outputExplanation.innerHTML = ''

    const text = (
        inputs.continuous ?
        'In a (Q, R) policy, Q is the order quantity and R is the reorder point. The inventory level is continuously monitored, and once it reaches R units, an order is placed for Q more units.' :
        (inputs.orderSetupCost === 0 ?
            'In an S policy (also known as an Order-Up-To Policy with Base Stock), S is the order-up-to level. During inventory review, enough inventory is ordered to bring the inventory position back up to the order-up-to level.' :
            'In an (S, s) policy (also known as an Order-Up-To Policy with Reorder Point), S is the order-up-to level and s is the reorder point. During inventory review, if the inventory level is below s, enough inventory is ordered to bring the inventory position back up to the order-up-to level. Otherwise, no inventory is ordered. An (S, s) policy with s = S is equivalent to an S policy.'
        )
    )

    outputExplanation.appendChild(document.createTextNode(text))
}
  
function calculate() {
    // get inputs
    const inputs = getCleanedInputs()
    if (!inputs) { return }

    // generate tables
    generateAllTables(inputs)

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

    // text for outputs
    generateOutputText(inputs)
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

const inputSchema = [
    {
        column: 'Input',
        type: String,
        value: row => row.name,
        width: 50
    },
    {
        column: 'Value',
        type: Number,
        format: '0.00',
        value: row => row.value,
        width: 20
    }
]

const outputSchema = (continuous, backorder) => [
    {
        column: 'Name',
        type: String,
        value: row => row.name,
        width: 35
    },
    {
        column: continuous ? 'Order Quantity Q' : 'Order Up To Level S',
        type: Number,
        value: row => row.QS,
        width: 25
    },
    {
        column: continuous ? 'Reorder Point R' : 'Reorder Point s',
        type: Number,
        value: row => row.Rs,
        width: 25
    },
    {
        column: 'Average Inventory I',
        type: Number,
        value: row => row.I,
        width: 25
    },
    {
        column: 'Average Flow Time T',
        type: Number,
        value: row => row.T,
        width: 25
    },
    {
        column: 'Throughput TH',
        type: Number,
        value: row => row.TH,
        width: 25
    },
    {
        column: 'Inventory Turn',
        type: Number,
        value: row => row.turns,
        width: 25
    },
    {
        column: 'Average Annual Inventory Cost',
        type: Number,
        value: row => row.invHoldingCost,
        width: 30
    },
    {
        column: backorder ? 'Average Annual Backorder Cost' : 'Average Annual Lost Sales Cost',
        type: Number,
        value: row => row.backorderLostsalesCost,
        width: 30
    },
    {
        column: 'Average Annual Setup Cost',
        type: Number,
        value: row => row.setupCost,
        width: 30
    },
    {
        column: 'Total Average Annual Cost',
        type: Number,
        value: row => row.totalCost,
        width: 30
    }
]

const inputKeyToSpreadsheetName = {
    'numPeriodsPerYear': 'Number of Periods Per Year',
    'demandMean': 'Mean Demand per Unit Time',
    'demandStdDev': 'Standard Deviation of Demand',
    'leadtimeMean': 'Mean Leadtime',
    'leadtimeStdDev': 'Standard Deviation of Leadtime',
    'purchasePrice': 'Purchase Price',
    'orderSetupCost': 'Order Setup Cost',
    'backorderLostsalesCost': 'Backorder/Lost Sales Cost',
    'invCarryingRate': 'Inventory Carrying Rate',
    'reviewPeriod': 'Review Period',
    'invReviewCost': 'Inventory Review Cost',
    'leadtimeDemandMean': 'Mean Demand during Leadtime',
    'leadtimeDemandStdDev': 'Standard Deviation of Demand over Leadtime',
    'leadtimePeriodDemandMean': 'Mean Demand during Leadtime and a Period',
    'leadtimePeriodDemandStdDev': 'Standard Deviation of Demand over Leadtime and a Period',
    'periodDemandMean': 'Mean Demand over a Period',
    'annualDemand': 'Demand per Year',
    'holdingCost': 'Holding Cost per unit per year'
}

const tradeoffSchema = (continuous, backorder, indepVarText) => [
    {
        column: indepVarText,
        type: Number,
        value: row => row.indepVarValue,
        width: 25
    },
    {
        column: continuous ? 'Order Quantity Q' : 'Order Up To Level S',
        type: Number,
        value: row => row.QS,
        width: 25
    },
    {
        column: continuous ? 'Reorder Point R' : 'Reorder Point s',
        type: Number,
        value: row => row.Rs,
        width: 25
    },
    {
        column: 'Average Annual Inventory Cost',
        type: Number,
        value: row => row.invHoldingCost,
        width: 30
    },
    {
        column: backorder ? 'Average Annual Backorder Cost' : 'Average Annual Lost Sales Cost',
        type: Number,
        value: row => row.backorderLostsalesCost,
        width: 30
    },
    {
        column: 'Average Annual Setup Cost',
        type: Number,
        value: row => row.setupCost,
        width: 30
    },
    {
        column: 'Total Average Annual Cost',
        type: Number,
        value: row => row.totalCost,
        width: 30
    }
]

async function downloadExcel() {
    // get inputs
    const rawInputs = getRawInputs()
    if (!rawInputsAreValid(rawInputs)) { return }
    const inputs = cleanInputs(rawInputs, false)

    // transform to inputs dataset
    const inputDataset = []
    for (let [key, value] of Object.entries(inputs)) {
        // causes Excel to break if non-finite, expects a finite number
        if (!isFinite(value)) { continue }

        // ignore irrelevant rows
        if (inputs.continuous && ['leadtimePeriodDemandMean', 'leadtimePeriodDemandStdDev', 'reviewPeriod', 'invReviewCost', 'periodDemandMean'].includes(key)) {
            continue
        }
        if (['alpha', 'beta', 'backorder', 'continuous'].includes(key)) { continue }

        inputDataset.push({
            name: inputKeyToSpreadsheetName[key],
            value
        })
    }

    // filename
    const cont = inputs.continuous ? 'Continuous' : 'Periodic'
    const back = inputs.backorder ? 'Backorder' : 'Lost Sales'
    const filename = `${cont} ${back} Inventory Results.xlsx`

    // Handle outputs
    const outputDataset = []

    const policyFuncs = [optimal, alpha, beta]
    const outputNames = ['Minimizing Total Average Annual Cost', 'Achieving Cycle Service Level', 'Achieving Fill Rate']

    for (let i = 0; i < outputNames.length; i++) {
        const policy = policyFuncs[i](inputs)
        const {I, T, TH, turns} = processFlowCalculations(policy, inputs)
        const {invHoldingCost, backorderLostsalesCost, setupCost, totalCost} = costCalculations(policy, inputs)
        const policyParam1 = inputs.continuous ? policy.Q : policy.S
        const policyParam2 = inputs.continuous ? policy.R : policy.s
        outputDataset.push({name: outputNames[i], QS: policyParam1, Rs: policyParam2, I, T, TH, turns, invHoldingCost, backorderLostsalesCost, setupCost, totalCost})
    }

    function createMaxValue(value) {
        // if value isn't 0, then just triple it
        if (value > 0) {
            return value * 3
        } else {
            // otherwise, just return 3
            return 3
        }
    }

    // Handle tradeoffs (graphInput objects)
    const tradeoffInputs = [
        {
            minValue: 0,
            maxValue: 0.99,
            indepVariableText: 'Cycle Service Level',
            indepVariableValue: 'alpha'
        },
        {
            minValue: 0,
            maxValue: 0.99,
            indepVariableText: 'Fill Rate',
            indepVariableValue: 'beta'
        },
        {
            minValue: 0,
            maxValue: createMaxValue(inputs.demandMean),
            indepVariableText: 'Demand Mean',
            indepVariableValue: 'demandMean'
        },
        {
            minValue: 0,
            maxValue: createMaxValue(inputs.demandStdDev),
            indepVariableText: 'Demand Standard Deviation',
            indepVariableValue: 'demandStdDev'
        },
        {
            minValue: 0,
            maxValue: createMaxValue(inputs.leadtimeMean),
            indepVariableText: 'Leadtime Mean',
            indepVariableValue: 'leadtimeMean'
        },
        {
            minValue: 0,
            maxValue: createMaxValue(inputs.leadtimeStdDev),
            indepVariableText: 'Leadtime Standard Deviation',
            indepVariableValue: 'leadtimeStdDev'
        },
        {
            minValue: 0,
            maxValue: createMaxValue(inputs.purchasePrice),
            indepVariableText: 'Purchase Price',
            indepVariableValue: 'purchasePrice'
        },
        {
            minValue: 0,
            maxValue: createMaxValue(inputs.orderSetupCost),
            indepVariableText: 'Order Setup Cost',
            indepVariableValue: 'orderSetupCost'
        },
        {
            minValue: 0,
            maxValue: createMaxValue(inputs.backorderLostsalesCost),
            indepVariableText: 'Backorder or Lost Sales Cost',
            indepVariableValue: 'backorderLostsalesCost'
        },
        {
            minValue: 0,
            maxValue: 100,
            indepVariableText: 'Inventory Carrying Rate',
            indepVariableValue: 'invCarryingRate'
        }
    ]

    const schemas = [inputSchema, outputSchema(inputs.continuous, inputs.backorder)]
    const sheetNames = ['Inputs', 'Outputs']
    const datasets = [inputDataset, outputDataset]

    for (let tradeoffInput of tradeoffInputs) {
        const {axisValues, policies, invHoldingCosts, backorderLostsalesCosts, orderSetupCosts, totalCosts} = getTradeoffData(rawInputs, tradeoffInput)
        const tradeoffDataset = []
        for (let i = 0; i < axisValues.length; i++) {
            if (isNaN(totalCosts[i])) { continue }
            tradeoffDataset.push({
                indepVarValue: axisValues[i],
                QS: inputs.continuous ? policies[i].Q : policies[i].S,
                Rs: inputs.continuous ? policies[i].R : policies[i].s,
                invHoldingCost: invHoldingCosts[i],
                backorderLostsalesCost: backorderLostsalesCosts[i],
                setupCost: orderSetupCosts[i],
                totalCost: totalCosts[i]
            })
        }
        datasets.push(tradeoffDataset)
        sheetNames.push(`${tradeoffInput.indepVariableText}`)
        schemas.push(tradeoffSchema(inputs.continuous, inputs.backorder, tradeoffInput.indepVariableText))
    }

    await writeXlsxFile(datasets, {
        schema: schemas,
        sheets: sheetNames,
        fileName: filename
    })
}

function fill() {
    document.getElementById('numPeriodsPerYear').value = 360
    document.getElementById('demandMean').value = 50
    document.getElementById('demandStdDev').value = 15
    document.getElementById('leadtimeMean').value = 5
    document.getElementById('leadtimeStdDev').value = 0
    document.getElementById('purchasePrice').value = 9
    document.getElementById('orderSetupCost').value = 60
    document.getElementById('backorderLostsalesCost').value = 3
    document.getElementById('invCarryingRate').value = 25
    if (document.getElementById('alpha')) {
        document.getElementById('alpha').value = 98
    }
    if (document.getElementById('beta')) {
        document.getElementById('beta').value = 95
    }
    if (document.getElementById('reviewPeriod')) {
        document.getElementById('reviewPeriod').value = 21
    }
    if (document.getElementById('invReviewCost')) {
        document.getElementById('invReviewCost').value = 0
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

function toggleServiceLevels(demandStdDev, leadtimeStdDev) {
    const serviceLevelsContainer = document.getElementById('service-levels-container')
    if (demandStdDev === 0 && leadtimeStdDev === 0) {
        savedServiceLevelsContainer = serviceLevelsContainer
        serviceLevelsContainer.remove()
    } else {
        const inputContainerInputs = document.getElementById('input-container-inputs')
        inputContainerInputs.appendChild(savedServiceLevelsContainer)
    }
}

// upon pressing 'Calculate Policies'
const submitButton = document.getElementById('input-submit')
submitButton.addEventListener('click', calculate)

// upon pressing 'Display Graph'
const graphButton = document.getElementById('graph-submit')
graphButton.addEventListener('click', showGraph)

// upon pressing 'Download as Excel'
const excelButton = document.getElementById('download-excel')
excelButton.addEventListener('click', downloadExcel)

// upon pressing 'Fill Data'
const fillButton = document.getElementById('fill')
fillButton.addEventListener('click', fill)

// handles visibility of review period details
let savedReviewPeriodDetailsContainer = document.getElementById('review-period-details-container')
// handle change of visibility
const reviewSelect = document.getElementById('review')
reviewSelect.addEventListener('change', (e) => togglePeriodDetails(e.target.value === 'continuous'))

// handles visibility of selecting service levels
let savedServiceLevelsContainer = document.getElementById('service-levels-container')
// handle change of visibility
const demandStdDevInput = document.getElementById('demandStdDev')
const leadtimeStdDevInput = document.getElementById('leadtimeStdDev')
demandStdDevInput.addEventListener('change', (e) => toggleServiceLevels(parseFloat(e.target.value), parseFloat(leadtimeStdDevInput.value)))
leadtimeStdDevInput.addEventListener('change', (e) => toggleServiceLevels(parseFloat(demandStdDevInput.value), parseFloat(e.target.value)))

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
