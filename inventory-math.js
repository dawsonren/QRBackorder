import * as ss from 'simple-statistics'

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

function invertFunction(func, y) {
    let left = -1000
    let right = 1000
    let tol = 0.00001
    let max_iters = 20
    let iters = 0

    while ((left <= right) && (iters <= max_iters)) {
        iters += 1
        let mid = left + (right - left) / 2;
        let midmid = func(mid);
        if (Math.abs(midmid - y) <= tol) return {x: mid, status: 0};
        if (midmid > y) {
            left = mid;
        } else {
            right = mid;
        }
    }

    return {x: -1, status: 1}
}

function invStandardNormalLossApprox(l) {
    // Use a log-polynomial approximation from
    // https://www.researchgate.net/profile/Claudia-Sikorski-2/publication/303854357_Numerical_Approximation_of_the_Inverse_Standardized_Loss_Function_for_Inventory_Control_Subject_to_Uncertain_Demand/links/5758251908ae5c6549075691/Numerical-Approximation-of-the-Inverse-Standardized-Loss-Function-for-Inventory-Control-Subject-to-Uncertain-Demand.pdf
    // The absolute error is at most 3 * 10 ** -4, which admittedly isn't great
    // The mean error is 10 ** -14, and the highest errors occur at extreme values
    const x = Math.log(l)
    const z = (4.41738119e-09*x**12  + 1.79200966e-07*x**11
         +3.01634229e-06*x**10 + 2.63537452e-05*x**9
         +1.12381749e-04*x**8  + 5.71289020e-06*x**7
         -2.64198510e-03*x**6  - 1.59986142e-02*x**5
         -5.60399292e-02*x**4  - 1.48968884e-01*x**3
         -3.68776346e-01*x**2  - 1.22551895e+00*x**1
         -8.99375602e-01)
    return z
}

function invStandardNormalLoss(l) {
    // If extreme-valued, prefer exact
    if ((l <= 0.01) || (l >= 1)) {
        const {x, status} = invertFunction(standardNormalLoss, l)
        // if non-zero status, default to approx
        if (status === 0) { return x }
    }

    return invStandardNormalLossApprox(l)
}

export { normalCDF, invNormalCDF, standardNormalLoss, invStandardNormalLoss }