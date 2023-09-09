import { costCalculations, optimal, beta, continuousFindAvgLostPerCycle, findRFromQ } from "./calculations"


function augmentInputs(inputs) {
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

    return inputs
}

function testRig(result, expected, testName, places=2) {
    const relativeError = (result - expected) / expected
    const equalToPlaces = parseFloat(result.toFixed(places)) === parseFloat(expected.toFixed(places))
    if (equalToPlaces || Math.abs(relativeError) < 5 ** -4) {
        console.log(`passed test ${testName}`)
    } else {
        console.log(`failed test ${testName}, expected ${expected}, got ${result}`)
    }
}

// From Chapter 10, Problem 16, Sonbox Coffee
function test1() {
    const rawInputs = {
        numPeriodsPerYear: 52,
        demandMean: 1400,
        demandStdDev: 300,
        leadtimeMean: 3,
        leadtimeStdDev: 0,
        purchasePrice: 0.2,
        orderSetupCost: 80,
        backorderLostsalesCost: 1.5,
        invCarryingRate: 0.25,
        backorder: 0,
        continuous: 1,
        beta: 0.95
    }

    const inputs = augmentInputs(rawInputs)
    const {totalCost} = costCalculations({Q: 5000, R: 500}, inputs)
    
    // Part a)
    testRig(totalCost, 82097.8, 'Sonbox Coffee A')

    // Part c)
    const avgLostPerCycle = continuousFindAvgLostPerCycle(inputs, 500)
    const betaValue = 1 - avgLostPerCycle / (5000 + avgLostPerCycle)
    testRig(betaValue, 0.5747, 'Sonbox Coffee C', 4)

    // Part d) - we calculate exact, within rounding error of textbook
    const R_new = findRFromQ(inputs, 5000)
    testRig(R_new, 5672.8, 'Sonbox Coffee D')

    // Part e)
    let Q, R
    Q = optimal(inputs).Q
    R = optimal(inputs).R
    testRig(Q, 15433, 'Sonbox Coffee E')
    testRig(R, 5476, 'Sonbox Coffee E')

    // Part f)
    Q = beta(inputs).Q
    R = beta(inputs).R
    testRig(Q, 15263, 'Sonbox Coffee F')
    testRig(R, 3411, 'Sonbox Coffee F')
}

// From Chpater 10, Problem 17, Sonbox Coffee 2
function test2() {
    const rawInputs = {
        numPeriodsPerYear: 52,
        demandMean: 1400,
        demandStdDev: 300,
        leadtimeMean: 2,
        leadtimeStdDev: 0,
        purchasePrice: 0.2,
        orderSetupCost: 0,
        backorderLostsalesCost: 1.5,
        invCarryingRate: 0.25,
        backorder: 0,
        continuous: 0,
        beta: 0.95,
        reviewPeriod: 5,
        invReviewCost: 0
    }

    const inputs = augmentInputs(rawInputs)

    // Part a)
    let S, s
    S = optimal(inputs).S
    s = optimal(inputs).s

    // THIS IS WRONG BECAUSE THERE'S A CALCULATION ERROR IN THE TEXTBOOK!!
    testRig(S, 12429, 'Sonbox Coffee 2 A')
    testRig(s, 12429, 'Sonbox Coffee 2 A')

    // Part b)
    const {totalCost} = costCalculations({S, s}, inputs)
    testRig(totalCost, 307.87, 'Sonbox Coffee 2 B')
}

// From Chapter 10, Problem 19, Coby Inn

test1()
test2()

