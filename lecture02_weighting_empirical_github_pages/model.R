# Lecture 02: distribution-dependent linear projection.
# Base R only. This file is used by both WebR and native R.

check_scalar <- function(value, name, lower, upper, integer = FALSE) {
  if (!is.numeric(value) || length(value) != 1L || !is.finite(value) ||
      value < lower || value > upper || (integer && value != floor(value))) {
    stop(sprintf("%s must be %s in [%g, %g].", name,
                 if (integer) "an integer" else "a number", lower, upper))
  }
}

distribution <- function(kind = "normal", mu = 2, spread = 3) {
  stopifnot(kind %in% c("normal", "uniform"))
  check_scalar(mu, "mu", 0, 10)
  check_scalar(spread, "spread", 0.5, 6)
  if (kind == "uniform") {
    density <- function(x) dunif(x, 0, 10)
    quantile <- function(p) qunif(p, 0, 10)
    probability <- function(lo, hi) (hi - lo) / 10
  } else {
    p0 <- pnorm(0, mu, spread)
    p10 <- pnorm(10, mu, spread)
    normalizer <- p10 - p0
    density <- function(x) ifelse(x >= 0 & x <= 10,
                                  dnorm(x, mu, spread) / normalizer, 0)
    quantile <- function(p) qnorm(p0 + p * normalizer, mu, spread)
    probability <- function(lo, hi) (pnorm(hi, mu, spread) -
                                      pnorm(lo, mu, spread)) / normalizer
  }
  list(kind = kind, mu = mu, spread = spread, density = density,
       quantile = quantile, probability = probability)
}

mean_function <- function(shape = "curve") {
  stopifnot(shape %in% c("curve", "line"))
  if (shape == "curve") function(x) 60 + 6*x - 0.3*x^2 else function(x) 60 + 3*x
}

expectation <- function(fun, d) {
  integrate(function(x) fun(x) * d$density(x), 0, 10,
            rel.tol = 1e-10, abs.tol = 1e-10, subdivisions = 300L)$value
}

population <- function(d, m) {
  ex <- expectation(function(x) x, d)
  ey <- expectation(m, d)
  vx <- expectation(function(x) (x - ex)^2, d)
  b <- expectation(function(x) (x - ex) * (m(x) - ey), d) / vx
  a <- ey - b * ex
  loss <- expectation(function(x) (m(x) - a - b*x)^2, d)
  list(intercept = a, slope = b, mean_x = ex, variance_x = vx,
       probability = d$probability(6, 10), loss = loss)
}

# Stable online least squares for all prefixes of the same sample.
# Prefixes 1-4 are not displayed in the UI.
prefix_ols <- function(x, y) {
  n <- length(x)
  a <- b <- rep(NA_real_, n)
  mx <- my <- sxx <- sxy <- 0
  for (i in seq_len(n)) {
    dx <- x[i] - mx
    dy <- y[i] - my
    mx <- mx + dx / i
    my <- my + dy / i
    sxx <- sxx + dx * (x[i] - mx)
    sxy <- sxy + dx * (y[i] - my)
    if (i >= 2 && sxx > .Machine$double.eps) {
      b[i] <- sxy / sxx
      a[i] <- my - b[i] * mx
    }
  }
  list(intercept = a, slope = b)
}

validate_settings <- function(n, sigma, seed) {
  check_scalar(n, "n", 20, 2000, TRUE)
  check_scalar(sigma, "sigma", 0, 15)
  check_scalar(seed, "seed", 1, 1000000000, TRUE)
}

experiment <- function(kind_a = "normal", mu_a = 2, sd_a = 3,
                       kind_b = "normal", mu_b = 8, sd_b = 3,
                       shape = "curve", n = 300, sigma = 5,
                       seed = 20261013) {
  validate_settings(n, sigma, seed)
  da <- distribution(kind_a, mu_a, sd_a)
  db <- distribution(kind_b, mu_b, sd_b)
  m <- mean_function(shape)
  pa <- population(da, m)
  pb <- population(db, m)
  grid <- seq(0, 10, length.out = 401)
  # Distinct seeds give independently generated samples for A and B.
  # Resetting the same seeds after a parameter change preserves the underlying
  # random numbers within each group, making changes easier to compare.
  sample_one <- function(d, p, sample_seed) {
    set.seed(sample_seed)
    x <- d$quantile(runif(n))
    y <- m(x) + sigma * rnorm(n)
    fit <- lm(y ~ x)
    list(population = p, x = x, y = y, mean = m(x),
         fitted = as.numeric(fitted(fit)),
         ols = list(intercept = unname(coef(fit)[1]),
                    slope = unname(coef(fit)[2])),
         prefix = prefix_ols(x, y),
         density = d$density(grid),
         line = p$intercept + p$slope * grid,
         weighted_error = (m(grid) - p$intercept - p$slope*grid)^2 * d$density(grid))
  }
  cross_loss <- function(p, d) {
    expectation(function(x) (m(x) - p$intercept - p$slope*x)^2, d)
  }
  list(grid = grid, curve = m(grid),
       a = sample_one(da, pa, seed), b = sample_one(db, pb, seed + 1L),
       losses = c(aa = cross_loss(pa, da), ab = cross_loss(pb, da),
                  ba = cross_loss(pa, db), bb = cross_loss(pb, db)),
       n = n, sigma = sigma, seed = seed, shape = shape)
}

repeat_experiment <- function(kind_a = "normal", mu_a = 2, sd_a = 3,
                              kind_b = "normal", mu_b = 8, sd_b = 3,
                              shape = "curve", n = 300, sigma = 5,
                              seed = 20261013, repetitions = 500) {
  validate_settings(n, sigma, seed)
  check_scalar(repetitions, "repetitions", 50, 2000, TRUE)
  da <- distribution(kind_a, mu_a, sd_a)
  db <- distribution(kind_b, mu_b, sd_b)
  m <- mean_function(shape)
  draw_slopes <- function(d, sample_seed) {
    set.seed(sample_seed)
    vapply(seq_len(repetitions), function(i) {
      x <- d$quantile(runif(n))
      y <- m(x) + sigma * rnorm(n)
      sum((x - mean(x)) * (y - mean(y))) / sum((x - mean(x))^2)
    }, numeric(1))
  }
  a <- draw_slopes(da, seed + 100L)
  b <- draw_slopes(db, seed + 101L)
  list(a = a, b = b, mean_a = mean(a), mean_b = mean(b),
       sd_a = sd(a), sd_b = sd(b), repetitions = repetitions,
       population_a = population(da, m)$slope,
       population_b = population(db, m)$slope)
}
