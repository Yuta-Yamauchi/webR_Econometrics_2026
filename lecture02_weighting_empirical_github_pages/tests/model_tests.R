args <- commandArgs(trailingOnly = TRUE)
source(if (length(args)) args[1] else "model.R", encoding = "UTF-8")
close_to <- function(actual, expected, tolerance = 1e-8) {
  stopifnot(length(actual) == length(expected), all(is.finite(actual)),
            max(abs(actual - expected)) < tolerance)
}
d <- experiment()
close_to(c(d$a$population$intercept, d$a$population$slope,
           d$b$population$intercept, d$b$population$slope),
         c(63.0621, 3.6656, 69.7180, 2.3344), 0.00005)
close_to(c(d$a$population$probability, d$b$population$probability),
         c(.1175, .6656), .00005)
stopifnot(d$losses['aa'] < d$losses['ab'], d$losses['bb'] < d$losses['ba'])
for (g in c('a','b')) {
  s <- d[[g]]
  stopifnot(all(s$x >= 0 & s$x <= 10), length(s$x) == 300)
  for (k in c(5,20,100,300)) {
    close_to(c(s$prefix$intercept[k],s$prefix$slope[k]),
             unname(coef(lm(s$y[seq_len(k)] ~ s$x[seq_len(k)]))))
  }
}
stopifnot(identical(d, experiment()))
linear <- experiment(shape = 'line', sigma = 0, mu_a = 0, sd_a = .5,
                     mu_b = 10, sd_b = .5)
close_to(c(linear$a$population$intercept, linear$b$population$intercept),c(60,60))
close_to(c(linear$a$population$slope,linear$b$population$slope,
           linear$a$ols$slope,linear$b$ols$slope),rep(3,4))
uniform <- experiment(kind_a = 'uniform', kind_b = 'uniform')
close_to(c(uniform$a$population$intercept,uniform$a$population$slope,
           uniform$a$population$probability),c(65,3,.4))
same <- experiment(mu_b = 2)
close_to(same$a$population$slope,same$b$population$slope)
more_noise <- experiment(sigma = 15)
stopifnot(identical(d$a$population, more_noise$a$population))
more_n <- experiment(n = 2000)
stopifnot(identical(d$b$population, more_n$b$population))
for (mu in c(0,5,10)) for (s in c(.5,3,6)) {
  dis <- distribution('normal',mu,s)
  close_to(expectation(function(x) rep(1,length(x)),dis),1)
  pp <- population(dis,mean_function())
  close_to(expectation(function(x) mean_function()(x)-pp$intercept-pp$slope*x,dis),0)
  close_to(expectation(function(x) x*(mean_function()(x)-pp$intercept-pp$slope*x),dis),0)
}
mc <- repeat_experiment(n = 100, repetitions = 50)
stopifnot(length(mc$a) == 50, all(is.finite(mc$a)), all(is.finite(mc$b)),
          identical(mc,repeat_experiment(n = 100,repetitions = 50)))
mc_line <- repeat_experiment(shape = 'line',sigma = 0,repetitions = 50)
close_to(mc_line$a,rep(3,50))
stopifnot(inherits(try(experiment(n = 2), silent = TRUE),'try-error'))
cat('All model tests passed.\n')
print(R.version.string)
print(data.frame(group=c('A','B'),
                 intercept=c(d$a$population$intercept,d$b$population$intercept),
                 slope=c(d$a$population$slope,d$b$population$slope),
                 probability_6_10=c(d$a$population$probability,d$b$population$probability)),digits=10)
