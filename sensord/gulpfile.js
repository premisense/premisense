var gulp   = require('gulp');
var tsc    = require('gulp-tsc');
var shell  = require('gulp-shell');
var runseq = require('run-sequence');
var mocha = require('gulp-mocha');
var clean = require('gulp-clean');

var paths = {
  tscripts: {
    src: ['src/**/*.ts'],
    dest: 'build'
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
  'node build/sensord.js'
]));

gulp.task('buildrun', function (cb) {
  runseq('build', 'run', cb);
});

// ** Watching ** //


gulp.task('watch', function () {
  gulp.watch(paths.tscripts.src, ['compile:typescript']);
});

gulp.task('watchrun', function () {
  gulp.watch(paths.tscripts.src, runseq('compile:typescript', 'run'));
});

// ** Compilation ** //

gulp.task('clean', function () {
  return gulp.src('build/**/*', {read: false})
    .pipe(clean());
});

gulp.task('build', ['clean', 'compile:typescript']);

gulp.task('compile:typescript', function () {
  return gulp
    .src(paths.tscripts.src)
    .pipe(tsc({
      module: "commonjs",
      target: "ES5",
      emitError: false,
      sourcemap: true
    }))
    .pipe(gulp.dest(paths.tscripts.dest));
});
