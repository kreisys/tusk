const Listr = require('listr')
const { Subject } = require('rxjs/Subject')
const { Observable } = require('rxjs/Observable')
const { forkJoin } = require('rxjs/observable/forkJoin')
const { concat } = require('rxjs/observable/concat')
const { yellow, green } = require('chalk')

class Tusk {
  constructor (input) {
    this.input = Object.entries(input).reduce(
      (a, [key, value]) => ({
        ...a,
        [key]: {
          dependencies: Array.isArray(value)
            ? value
            : value.dependencies ? value.dependencies : [],
          action: typeof value === 'function'
            ? value
            : value.action ? value.action : null
        }
      }),
      {}
    )
  }

  run (task) {
    const expandedDependencies = this.expandDependencies(task)
    const context = expandedDependencies.reduce((acc, { name }) => {
      const subject = new Subject()
      subject.completed = false
      subject.subscribe(null, null, () => (subject.completed = true))
      return {
        ...acc,
        [name]: subject
      }
    }, {})

    return new Listr(
      expandedDependencies.map(({ name, action, dependencies }) => ({
        title: name +
        (dependencies.length > 0
          ? ` [ ${yellow(dependencies.join(' '))} ]`
          : ''),
        task: (ctx, task) => {
          const dependencies$ = dependencies.map(dep => [dep, ctx[dep]])
          dependencies$.forEach(([dep, dep$]) => {
            dep$.next(name)
            dep$.subscribe(null, null, () => {
              task.title =
              name +
              (dependencies.length > 0
                ? ` [ ${dependencies$
                  .map(([dep, dep$]) =>
                    (dep$.completed ? green : yellow)(dep)
                  )
                  .join(' ')} ]`
                : '')
            })
          })

          return concat(forkJoin(...dependencies.map(dep => ctx[dep])), Observable.of(0))
            .flatMap(() => action())
            .do(null, null, () => {
              task.title += ' - done!'
              ctx[name].next('done')
              ctx[name].complete()
            })
        }
      }
      )),
      { concurrent: true, renderer: 'default' }
    ).run(context).catch(err => {
      console.error('\n', err.message)
      process.exit(1)
    })
  }

  expandDependencies (task) {
    const { dependencies } = this.input[task]
    return Array.prototype.concat(
      ...dependencies.map(
        dep =>
          (this.input[dep].action
            ? { ...this.input[dep], name: dep }
            : this.expandDependencies(dep))
      )
    )
  }
}

module.exports = { Tusk }
