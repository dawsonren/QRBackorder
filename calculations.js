/*
Defines all inventory calculations used by the website.

A policy is an object with float values for {Q, R} or {S, s}.
We can calculate an optimal policy for min cost or to meet alpha/beta.
Once we have an optimal policy, we can calculate both the process flow and cost information.
*/
import { invNormalCDF, standardNormalLoss, invStandardNormalLoss } from './inventory-math'

/* Helper Functions */

// corresponds with η(R) in the book
function continuousFindAvgLostPerCycle(inputs, R) {
    const z = (R - inputs.leadtimeDemandMean) / inputs.leadtimeDemandStdDev
    return inputs.leadtimeDemandStdDev * standardNormalLoss(z)
}

// corresponds with η(S) in the book
function periodicFindAvgLostPerCycle(inputs, S) {
    const z = (S - inputs.leadtimePeriodDemandMean) / inputs.leadtimePeriodDemandStdDev
    return inputs.leadtimePeriodDemandStdDev * standardNormalLoss(z)
}

// calculates optimal R from Q for continuous processes (both backorder/lost sales)
function findRFromQ(inputs, Q) {
    let denom = inputs.backorderLostsalesCost * inputs.annualDemand
    // lost sales?
    if (!inputs.backorder) {
        denom += inputs.holdingCost * Q
    }
    console.log(1 - (inputs.holdingCost * Q / denom))
    const z = invNormalCDF(1 - (inputs.holdingCost * Q / denom))
    return inputs.leadtimeDemandMean + inputs.leadtimeDemandStdDev * z
}

/* Process Flow Calculations */
function continuousProcessFlowCalculations(Q, R, inputs) {
    const avgLossPerCycle = continuousFindAvgLostPerCycle(inputs, R)
    const annualDemand = inputs.numPeriodsPerYear * inputs.demandMean

    let avgInv = Q / 2 + R - inputs.leadtimeDemandMean
    // lost sales?
    if (!inputs.backorder) {
        avgInv += avgLossPerCycle
    }
    const avgFlowTime = avgInv / annualDemand * inputs.numPeriodsPerYear
    const avgThroughput = avgInv / avgFlowTime
    const avgInvTurns = inputs.numPeriodsPerYear / avgFlowTime
    return {
        I: avgInv,
        T: avgFlowTime,
        TH: avgThroughput,
        turns: avgInvTurns
    }
}

function periodicProcessFlowCalculations(S, s, inputs) {
    const avgLossPerCycle = periodicFindAvgLostPerCycle(inputs, S)
    const annualDemand = inputs.numPeriodsPerYear * inputs.demandMean
    // this is incorrect!
    let avgInv = inputs.periodDemandMean / 2 + S - inputs.leadtimePeriodDemandMean
    // lost sales?
    if (!inputs.backorder) {
        avgInv += avgLossPerCycle
    }

    const avgFlowTime = avgInv / annualDemand * inputs.numPeriodsPerYear
    const avgThroughput = avgInv / avgFlowTime
    const avgInvTurns = inputs.numPeriodsPerYear / avgFlowTime
    return {
        I: avgInv,
        T: avgFlowTime,
        TH: avgThroughput,
        turns: avgInvTurns
    }
}

// generalizes
function processFlowCalculations(policy, inputs) {
    if (inputs.continuous) {
        return continuousProcessFlowCalculations(policy.Q, policy.R, inputs)
    } else {
        return periodicProcessFlowCalculations(policy.S, policy.s, inputs)
    }
}

/* Cost Calculations */
function continuousCostCalculations(Q, R, inputs) {
    const avgLossPerCycle = continuousFindAvgLostPerCycle(inputs, R)
    const ordersPerYear = inputs.annualDemand / Q
    let avgInv = Q / 2 + R - inputs.leadtimeDemandMean
    // lost sales?
    if (!inputs.backorder) {
        avgInv += avgLossPerCycle
    }

    const invHoldingCost = avgInv * inputs.holdingCost
    const backorderLostsalesCost = inputs.backorderLostsalesCost * avgLossPerCycle * ordersPerYear
    const setupCost = inputs.orderSetupCost * ordersPerYear
    const totalCost = invHoldingCost + backorderLostsalesCost + setupCost

    return {
        invHoldingCost,
        backorderLostsalesCost,
        setupCost,
        totalCost
    }
}

function periodicCostCalculations(S, s, inputs) {
    const avgLossPerPeriod = periodicFindAvgLostPerCycle(inputs, S)
    const ordersPerYear = inputs.numPeriodsPerYear / inputs.reviewPeriod
    let avgInv = inputs.periodDemandMean / 2 + S - inputs.leadtimePeriodDemandMean
    if (!inputs.backorder) {
        avgInv += periodicFindAvgLostPerCycle(inputs, S)
    }

    const invHoldingCost = avgInv * inputs.holdingCost
    const backorderLostsalesCost = inputs.backorderLostsalesCost * avgLossPerPeriod * ordersPerYear
    // should we incorporate order setup cost into this? As in, inputs.orderSetupCost?
    const setupCost = inputs.invReviewCost * ordersPerYear
    const totalCost = invHoldingCost + backorderLostsalesCost + setupCost

    console.log({
        invHoldingCost,
        backorderLostsalesCost,
        setupCost,
        totalCost
    })

    return {
        invHoldingCost,
        backorderLostsalesCost,
        setupCost,
        totalCost
    }
}

// generalizes
function costCalculations(policy, inputs) {
    if (inputs.continuous) {
        return continuousCostCalculations(policy.Q, policy.R, inputs)
    } else {
        return periodicCostCalculations(policy.S, policy.s, inputs)
    }
}

/* Find Min Cost Policies */
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

        console.log(Q_old, R_old)

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
    // when order setup cost is small
    let denom = inputs.backorderLostsalesCost
    let timePeriod = 1 / inputs.periodsPerYear
    if (!inputs.backorder) {
        denom += inputs.holdingCost * timePeriod
    }
    const p = 1 - (inputs.holdingCost / denom) * timePeriod
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

// generalizes
function optimal(inputs) {
    if (inputs.continuous) {
        return optimalContinuous(inputs)
    } else {
        return optimalPeriodic(inputs)
    }
}

/* Find Policies that meet Alpha/Beta Service Levels */
function alphaContinuous(inputs) {
    const R = inputs.leadtimeDemandMean + invNormalCDF(inputs.alpha) * inputs.leadtimeDemandStdDev
    const backorderLostsalesLoss = inputs.backorderLostsalesCost * continuousFindAvgLostPerCycle(inputs, R)
    const Q = Math.sqrt(2 * inputs.annualDemand * (inputs.orderSetupCost + backorderLostsalesLoss) / inputs.holdingCost)
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

// generalizes
function alpha(inputs) {
    if (inputs.continuous) {
        return alphaContinuous(inputs)
    } else {
        return alphaPeriodic(inputs)
    }
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

function betaPeriodic(inputs) {
    // assume that K = 0
    const loss = (1 - inputs.beta) * inputs.leadtimePeriodDemandMean / inputs.leadtimePeriodDemandStdDev
    const z = invStandardNormalLoss(loss)
    const S = inputs.leadtimePeriodDemandMean + inputs.leadtimePeriodDemandStdDev * z
    return {
        S: S,
        s: S
    }
}

// generalizes
function beta(inputs) {
    if (inputs.continuous) {
        return betaContinuous(inputs)
    } else {
        return betaPeriodic(inputs)
    }
}

export { processFlowCalculations, costCalculations, optimal, alpha, beta, continuousFindAvgLostPerCycle, findRFromQ }