import { costCalculations, optimal, alpha, beta, continuousFindAvgLostPerCycle, periodicFindAvgLostPerCycle, findRFromQ, processFlowCalculations } from "./calculations"


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
    // Relative error less than < 1% to account for rounding differences in the textbook
    if (equalToPlaces || Math.abs(relativeError) < 10 ** -2) {
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

    // TODO: THIS IS WRONG BECAUSE THERE'S A CALCULATION ERROR IN THE TEXTBOOK!!
    testRig(S, 12429, 'Sonbox Coffee 2 A')
    testRig(s, 12429, 'Sonbox Coffee 2 A')

    // Part b)
    const fracLostCustomers = periodicFindAvgLostPerCycle(inputs, S) / inputs.leadtimePeriodDemandMean
    testRig(fracLostCustomers, 0.000001, 'Sonbox Coffee 2 B')

    // Part c)
    testRig(costCalculations({S, s}, inputs).totalCost, 307.87, 'Sonbox Coffee 2 C')
    inputs.continuous = 1
    inputs.orderSetupCost = 80
    let Q, R
    Q = optimal(inputs).Q
    R = optimal(inputs).R
    testRig(costCalculations({Q, R}, inputs).totalCost, 835.5, 'Sonbox Coffee 2 C')
}

// From Chpater 10, Problem 18, DDA
function test3() {
    const rawInputs = {
        numPeriodsPerYear: 52,
        demandMean: 40,
        demandStdDev: 12,
        leadtimeMean: 2,
        leadtimeStdDev: 0,
        purchasePrice: 110,
        orderSetupCost: 450,
        backorderLostsalesCost: 15,
        invCarryingRate: 0.3,
        backorder: 1,
        continuous: 1,
        beta: 0.98
    }

    const inputs = augmentInputs(rawInputs)

    // Part a)
    let Q, R
    Q = optimal(inputs).Q
    R = optimal(inputs).R
    testRig(Q, 248.73, 'DDA A')
    testRig(R, 90.77, 'DDA A')
    testRig(costCalculations({Q, R}, inputs).totalCost, 8571.35, 'DDA A')

    // Part b)
    testRig(1 - continuousFindAvgLostPerCycle(inputs, R) / Q, 0.989, 'DDA B')

    // Part c)
    Q = beta(inputs).Q
    R = beta(inputs).R
    testRig(Q, 238.17, 'DDA C')
    testRig(R, 84.5, 'DDA C')
}

// From Chapter 10, Problem 19, Coby Inn
function test4() {
    const rawInputs = {
        numPeriodsPerYear: 360,
        demandMean: 50,
        demandStdDev: 15,
        leadtimeMean: 5,
        leadtimeStdDev: 2,
        purchasePrice: 9,
        orderSetupCost: 60,
        backorderLostsalesCost: 3,
        invCarryingRate: 0.2,
        backorder: 0,
        continuous: 1,
        beta: 0.95,
        reviewPeriod: 5,
        invReviewCost: 0
    }

    const inputs = augmentInputs(rawInputs)

    // Part a)
    let Q, R
    Q = optimal(inputs).Q
    R = optimal(inputs).R
    testRig(Q, 1136.56, 'Coby Inn A')
    testRig(R, 439.11, 'Coby Inn A')
    testRig(costCalculations({Q, R}, inputs).totalCost, 2389.5, 'Coby Inn A')

    // Part b)
    testRig(processFlowCalculations({Q, R}, inputs).T, 15.19, 'Coby Inn B')

    // Part c)
    Q = beta(inputs).Q
    R = beta(inputs).R
    testRig(Q, 1095.44, 'Coby Inn C')
    testRig(R, 222.58, 'Coby Inn C')

    // Part d)
    R = findRFromQ(inputs, 500)
    testRig(R, 476.17, 'Coby Inn D')
}

// From Chapter 10, Problem 20, Coby Inn Cont.
function test5() {
    const rawInputs = {
        numPeriodsPerYear: 360,
        demandMean: 50,
        demandStdDev: 15,
        leadtimeMean: 5,
        leadtimeStdDev: 0,
        purchasePrice: 9,
        orderSetupCost: 60,
        backorderLostsalesCost: 3,
        invCarryingRate: 0.2,
        backorder: 0,
        continuous: 0,
        beta: 0.95,
        reviewPeriod: 21,
        invReviewCost: 0
    }

    const inputs = augmentInputs(rawInputs)

    // Part a)
    let S, s
    S = optimal(inputs).S
    s = optimal(inputs).s
    testRig(S, 1419, 'Coby Inn Cont. A')
    testRig(s, 310, 'Coby Inn Cont. A')

    // Part b)
    inputs.orderSetupCost = 0
    S = optimal(inputs).S
    s = optimal(inputs).s
    testRig(S, 1440, 'Coby Inn Cont. B')
    testRig(s, 1440, 'Coby Inn Cont. B')

    // Part c)
    testRig(processFlowCalculations({S, s}, inputs).T, 13.32, 'Coby Inn Cont. C')
    testRig(costCalculations({S, s}, inputs).totalCost, 1251.55, 'Coby Inn Cont. C')
}

// From Chapter 10, Problem 21, Evanston Pharmacy
function test6() {
    const rawInputs = {
        numPeriodsPerYear: 360,
        demandMean: 5,
        demandStdDev: 2,
        leadtimeMean: 2,
        leadtimeStdDev: 0,
        purchasePrice: 12,
        orderSetupCost: 80,
        backorderLostsalesCost: 3,
        invCarryingRate: 0.35,
        backorder: 1,
        continuous: 0,
        alpha: 0.98,
        beta: 0.98,
        reviewPeriod: 10,
        invReviewCost: 0
    }

    const inputs = augmentInputs(rawInputs)

    // Part a)
    let S, s
    S = optimal(inputs).S
    s = optimal(inputs).s
    testRig(S, 275, 'Pharmacy A')
    testRig(s, 12.33, 'Pharmacy A')

    // Part b)
    S = alpha(inputs).S
    s = alpha(inputs).s
    testRig(S, 74.228, 'Pharmacy B')
    testRig(s, 74.228, 'Pharmacy B')
    testRig(costCalculations({S: 75, s: 75}, inputs).totalCost, 173.537, 'Pharmacy B')

    // Part c)
    S = beta(inputs).S
    s = beta(inputs).s
    testRig(S, 64.045, 'Pharmacy C')
    testRig(s, 64.045, 'Pharmacy C')
}

// From Chapter 9, Problem 10, Coby Inn
function test7() {
    const rawInputs = {
        numPeriodsPerYear: 360,
        demandMean: 50,
        demandStdDev: 0,
        leadtimeMean: 10,
        leadtimeStdDev: 0,
        purchasePrice: 4,
        orderSetupCost: 250,
        backorderLostsalesCost: 0,
        invCarryingRate: 0.2,
        backorder: 1,
        continuous: 1,
    }

    const inputs = augmentInputs(rawInputs)

    // Part a)
    let Q, R
    Q = 4500
    R = findRFromQ(inputs, 4500)
    testRig(costCalculations({Q, R}, inputs).invHoldingCost, 1800, 'Coby Inn EOQ A')
    testRig(costCalculations({Q, R}, inputs).setupCost, 1000, 'Coby Inn EOQ A')

    // Part b)
    Q = optimal(inputs).Q
    testRig(Q, 3354.1, 'Coby Inn EOQ B')

    // Part c)
    R = findRFromQ(inputs, Q)
    testRig(R, 500, 'Coby Inn EOQ C')
}

test1()
// test2()
test3()
test4()
test5()
test6()
test7()
