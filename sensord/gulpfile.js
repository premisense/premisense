var gulp   = require('gulp');
var traceur = require('gulp-traceur');
var shell  = require('gulp-shell');
var runseq = require('run-sequence');
var mocha = require('gulp-mocha');
var clean = require('gulp-clean');

var paths = {
  es6: {
    src: ['src/**/*.js'],
    dest: 'out'
  },
  test: ['build/**/test-*.js']
};

gulp.task('default', ['buildrun']);

gulp.task('test', function () {
  return gulp.src(paths.test, {read: false})
    .pipe(mocha({reporter: 'nyan'}));
});

// ** Running ** //

gulp.task('run', shell.task([
  'node out/src/sensord.js'
]));

gulp.task('buildrun', function (cb) {
  runseq('build', 'run', cb);
});

// ** Watching ** //


gulp.task('watch', function () {
  gulp.watch(paths.es6.src, ['compile:traceur']);
});

gulp.task('watchrun', function () {
  gulp.watch(paths.es6.src, runseq('compile:traceur', 'run'));
});

// ** Compilation ** //

gulp.task('clean', function () {
  return gulp.src('build/**/*', {read: false})
    .pipe(clean());
});

gulp.task('build', ['clean', 'compile:traceur']);
// --async-functions true --source-root "../.." --type-assertions --atscript --modules commonjs --require true --source-maps file --dir ./src out/src

// traceur --async-functions true --source-root "../.." --type-assertions --atscript --modules commonjs --require true --memberVariables true --types true --source-maps file --dir ./src out/src

gulp.task('compile:traceur', function () {
  return gulp
    .src(paths.es6.src)
    .pipe(traceur({
      asyncFunctions: true,
      sourceRoot: "../../",
      typeAssertions: true,
      types: true,
      atscript: true,
      memberVariables: true,
      modules: "commonjs",
      require: true,
      sourceMaps: "file"
      //module: "commonjs",
      //target: "ES5",
      //emitError: false,
      //sourcemap: true
    }))
    .pipe(gulp.dest(paths.es6.dest));
});
