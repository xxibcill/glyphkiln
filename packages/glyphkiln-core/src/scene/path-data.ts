type PathCommand = "A" | "C" | "H" | "L" | "M" | "Q" | "S" | "T" | "V" | "Z";

type PathToken =
  | { type: "command"; value: string }
  | { type: "number"; value: number; source: string };

type Point = { x: number; y: number };

type PathState = {
  current: Point;
  subpathStart: Point;
  previousCommand: PathCommand | undefined;
  previousCubicControl: Point | undefined;
  previousQuadraticControl: Point | undefined;
};

export type ScenePathDataProblem = {
  code:
    | "SCENE_PATH_DATA_SYNTAX_INVALID"
    | "SCENE_PATH_NUMBER_NONFINITE"
    | "SCENE_PATH_NUMBER_PRECISION_UNSUPPORTED"
    | "SCENE_PATH_GEOMETRY_OUT_OF_BOUNDS";
  message: string;
};

const supportedCommands = new Set("AaCcHhLlMmQqSsTtVvZz");
const parameterCounts: Readonly<Record<Exclude<PathCommand, "Z">, number>> = {
  A: 7,
  C: 6,
  H: 1,
  L: 2,
  M: 2,
  Q: 4,
  S: 4,
  T: 2,
  V: 1,
};
const numberPattern = /[+-]?(?:(?:\d+\.\d*)|(?:\.\d+)|(?:\d+))(?:[eE][+-]?\d+)?/y;

export function getScenePathDataProblem(
  data: string,
  maximumMagnitude: number,
  serializationResolution: number,
): ScenePathDataProblem | undefined {
  const tokenized = tokenizePathData(data);
  if ("problem" in tokenized) return tokenized.problem;
  const tokens = tokenized.tokens;
  if (tokens[0]?.type !== "command" || tokens[0].value.toUpperCase() !== "M") {
    return syntaxProblem("Path data must begin with a moveto command.");
  }

  let tokenIndex = 0;
  const state: PathState = {
    current: { x: 0, y: 0 },
    subpathStart: { x: 0, y: 0 },
    previousCommand: undefined,
    previousCubicControl: undefined,
    previousQuadraticControl: undefined,
  };
  while (tokenIndex < tokens.length) {
    const commandToken = tokens[tokenIndex];
    if (commandToken?.type !== "command") {
      return syntaxProblem("Every path parameter sequence needs a command.");
    }
    const sourceCommand = commandToken.value;
    const command = sourceCommand.toUpperCase() as PathCommand;
    const relative = sourceCommand !== command;
    tokenIndex += 1;

    if (command === "Z") {
      state.current = { ...state.subpathStart };
      state.previousCommand = "Z";
      state.previousCubicControl = undefined;
      state.previousQuadraticControl = undefined;
      continue;
    }

    const parameterStart = tokenIndex;
    while (tokens[tokenIndex]?.type === "number") tokenIndex += 1;
    const parameters = tokens.slice(parameterStart, tokenIndex);
    const parameterCount = parameterCounts[command];
    if (parameters.length === 0 || parameters.length % parameterCount !== 0) {
      return syntaxProblem(
        `${command} commands require complete groups of ${parameterCount.toString()} parameters.`,
      );
    }

    for (const parameter of parameters) {
      if (parameter.type !== "number") {
        return syntaxProblem("Path command parameters must be numbers.");
      }
      if (!Number.isFinite(parameter.value)) {
        return {
          code: "SCENE_PATH_NUMBER_NONFINITE",
          message: "Path numbers must be finite.",
        };
      }
      if (Math.abs(parameter.value) > maximumMagnitude) {
        return boundsProblem(maximumMagnitude);
      }
      if (!isOnSerializationGrid(parameter.value, serializationResolution)) {
        return {
          code: "SCENE_PATH_NUMBER_PRECISION_UNSUPPORTED",
          message: `Path numbers must use the ${serializationResolution.toString()} serialization grid.`,
        };
      }
    }

    for (
      let parameterIndex = 0;
      parameterIndex < parameters.length;
      parameterIndex += parameterCount
    ) {
      const group = parameters.slice(
        parameterIndex,
        parameterIndex + parameterCount,
      ) as Extract<PathToken, { type: "number" }>[];
      const effectiveCommand = command === "M" && parameterIndex > 0 ? "L" : command;
      const problem = applyParameterGroup({
        command: effectiveCommand,
        relative,
        group,
        state,
        maximumMagnitude,
      });
      if (problem !== undefined) return problem;
      if (command === "M" && parameterIndex === 0) {
        state.subpathStart = { ...state.current };
      }
    }
  }
  return undefined;
}

function tokenizePathData(
  data: string,
): { tokens: PathToken[] } | { problem: ScenePathDataProblem } {
  const tokens: PathToken[] = [];
  let index = 0;
  let commaPending = false;
  while (index < data.length) {
    const character = data[index]!;
    if (isWhitespace(character)) {
      index += 1;
      continue;
    }
    if (character === ",") {
      if (commaPending || tokens.at(-1)?.type !== "number") {
        return { problem: syntaxProblem("Path commas must separate numbers.") };
      }
      commaPending = true;
      index += 1;
      continue;
    }
    if (/[A-Za-z]/.test(character)) {
      if (commaPending || !supportedCommands.has(character)) {
        return {
          problem: syntaxProblem(
            `Unsupported or misplaced path command "${character}".`,
          ),
        };
      }
      tokens.push({ type: "command", value: character });
      index += 1;
      continue;
    }

    numberPattern.lastIndex = index;
    const match = numberPattern.exec(data);
    if (match === null) {
      return {
        problem: syntaxProblem(`Invalid path syntax at character ${index.toString()}.`),
      };
    }
    const source = match[0];
    const value = Number(source);
    tokens.push({ type: "number", value, source });
    commaPending = false;
    index = numberPattern.lastIndex;
  }
  if (commaPending) {
    return { problem: syntaxProblem("Path data must not end with a comma.") };
  }
  return { tokens };
}

function applyParameterGroup(input: {
  command: Exclude<PathCommand, "Z">;
  relative: boolean;
  group: Extract<PathToken, { type: "number" }>[];
  state: PathState;
  maximumMagnitude: number;
}): ScenePathDataProblem | undefined {
  const values = input.group.map((token) => token.value);
  switch (input.command) {
    case "M":
    case "L": {
      const endpoint = resolvePoint(
        values[0]!,
        values[1]!,
        input.relative,
        input.state.current,
      );
      return finishSegment(input, endpoint);
    }
    case "H": {
      const endpoint = {
        x: input.relative ? input.state.current.x + values[0]! : values[0]!,
        y: input.state.current.y,
      };
      return finishSegment(input, endpoint);
    }
    case "V": {
      const endpoint = {
        x: input.state.current.x,
        y: input.relative ? input.state.current.y + values[0]! : values[0]!,
      };
      return finishSegment(input, endpoint);
    }
    case "C": {
      const control1 = resolvePoint(
        values[0]!,
        values[1]!,
        input.relative,
        input.state.current,
      );
      const control2 = resolvePoint(
        values[2]!,
        values[3]!,
        input.relative,
        input.state.current,
      );
      const endpoint = resolvePoint(
        values[4]!,
        values[5]!,
        input.relative,
        input.state.current,
      );
      const problem =
        checkPoints([control1, control2, endpoint], input.maximumMagnitude) ??
        checkCubicBounds(
          input.state.current,
          control1,
          control2,
          endpoint,
          input.maximumMagnitude,
        );
      if (problem !== undefined) return problem;
      commitSegment(input.state, input.command, endpoint, control2, undefined);
      return undefined;
    }
    case "S": {
      const control1 =
        (input.state.previousCommand === "C" || input.state.previousCommand === "S") &&
        input.state.previousCubicControl !== undefined
          ? reflectPoint(input.state.previousCubicControl, input.state.current)
          : { ...input.state.current };
      const control2 = resolvePoint(
        values[0]!,
        values[1]!,
        input.relative,
        input.state.current,
      );
      const endpoint = resolvePoint(
        values[2]!,
        values[3]!,
        input.relative,
        input.state.current,
      );
      const problem =
        checkPoints([control1, control2, endpoint], input.maximumMagnitude) ??
        checkCubicBounds(
          input.state.current,
          control1,
          control2,
          endpoint,
          input.maximumMagnitude,
        );
      if (problem !== undefined) return problem;
      commitSegment(input.state, input.command, endpoint, control2, undefined);
      return undefined;
    }
    case "Q": {
      const control = resolvePoint(
        values[0]!,
        values[1]!,
        input.relative,
        input.state.current,
      );
      const endpoint = resolvePoint(
        values[2]!,
        values[3]!,
        input.relative,
        input.state.current,
      );
      const problem =
        checkPoints([control, endpoint], input.maximumMagnitude) ??
        checkQuadraticBounds(
          input.state.current,
          control,
          endpoint,
          input.maximumMagnitude,
        );
      if (problem !== undefined) return problem;
      commitSegment(input.state, input.command, endpoint, undefined, control);
      return undefined;
    }
    case "T": {
      const control =
        (input.state.previousCommand === "Q" || input.state.previousCommand === "T") &&
        input.state.previousQuadraticControl !== undefined
          ? reflectPoint(input.state.previousQuadraticControl, input.state.current)
          : { ...input.state.current };
      const endpoint = resolvePoint(
        values[0]!,
        values[1]!,
        input.relative,
        input.state.current,
      );
      const problem =
        checkPoints([control, endpoint], input.maximumMagnitude) ??
        checkQuadraticBounds(
          input.state.current,
          control,
          endpoint,
          input.maximumMagnitude,
        );
      if (problem !== undefined) return problem;
      commitSegment(input.state, input.command, endpoint, undefined, control);
      return undefined;
    }
    case "A": {
      if (values[0]! < 0 || values[1]! < 0) {
        return syntaxProblem("Arc radii must be non-negative.");
      }
      if (!/^[01]$/.test(input.group[3]!.source)) {
        return syntaxProblem("Arc large-arc flags must be exactly 0 or 1.");
      }
      if (!/^[01]$/.test(input.group[4]!.source)) {
        return syntaxProblem("Arc sweep flags must be exactly 0 or 1.");
      }
      const endpoint = resolvePoint(
        values[5]!,
        values[6]!,
        input.relative,
        input.state.current,
      );
      const problem =
        checkPoints([endpoint], input.maximumMagnitude) ??
        checkArcBounds({
          start: input.state.current,
          endpoint,
          radiusX: values[0]!,
          radiusY: values[1]!,
          rotationDegrees: values[2]!,
          largeArc: values[3] === 1,
          sweep: values[4] === 1,
          maximumMagnitude: input.maximumMagnitude,
        });
      if (problem !== undefined) return problem;
      commitSegment(input.state, input.command, endpoint, undefined, undefined);
      return undefined;
    }
  }
}

function finishSegment(
  input: Pick<
    Parameters<typeof applyParameterGroup>[0],
    "command" | "state" | "maximumMagnitude"
  >,
  endpoint: Point,
): ScenePathDataProblem | undefined {
  const problem = checkPoints([endpoint], input.maximumMagnitude);
  if (problem !== undefined) return problem;
  commitSegment(input.state, input.command, endpoint, undefined, undefined);
  return undefined;
}

function commitSegment(
  state: PathState,
  command: Exclude<PathCommand, "Z">,
  endpoint: Point,
  cubicControl: Point | undefined,
  quadraticControl: Point | undefined,
): void {
  state.current = endpoint;
  state.previousCommand = command;
  state.previousCubicControl = cubicControl;
  state.previousQuadraticControl = quadraticControl;
}

function resolvePoint(x: number, y: number, relative: boolean, current: Point): Point {
  return relative ? { x: current.x + x, y: current.y + y } : { x, y };
}

function reflectPoint(control: Point, around: Point): Point {
  return {
    x: 2 * around.x - control.x,
    y: 2 * around.y - control.y,
  };
}

function checkQuadraticBounds(
  start: Point,
  control: Point,
  endpoint: Point,
  maximumMagnitude: number,
): ScenePathDataProblem | undefined {
  const parameters = new Set<number>([0, 1]);
  addQuadraticExtremum(parameters, start.x, control.x, endpoint.x);
  addQuadraticExtremum(parameters, start.y, control.y, endpoint.y);
  return checkComputedPoints(
    [...parameters].map((parameter) =>
      quadraticPoint(start, control, endpoint, parameter),
    ),
    maximumMagnitude,
  );
}

function addQuadraticExtremum(
  parameters: Set<number>,
  start: number,
  control: number,
  endpoint: number,
): void {
  const denominator = start - 2 * control + endpoint;
  if (denominator === 0) return;
  const parameter = (start - control) / denominator;
  if (parameter > 0 && parameter < 1 && Number.isFinite(parameter)) {
    parameters.add(parameter);
  }
}

function quadraticPoint(
  start: Point,
  control: Point,
  endpoint: Point,
  parameter: number,
): Point {
  const remainder = 1 - parameter;
  return {
    x:
      remainder * remainder * start.x +
      2 * remainder * parameter * control.x +
      parameter * parameter * endpoint.x,
    y:
      remainder * remainder * start.y +
      2 * remainder * parameter * control.y +
      parameter * parameter * endpoint.y,
  };
}

function checkCubicBounds(
  start: Point,
  control1: Point,
  control2: Point,
  endpoint: Point,
  maximumMagnitude: number,
): ScenePathDataProblem | undefined {
  const parameters = new Set<number>([0, 1]);
  addCubicExtrema(parameters, start.x, control1.x, control2.x, endpoint.x);
  addCubicExtrema(parameters, start.y, control1.y, control2.y, endpoint.y);
  return checkComputedPoints(
    [...parameters].map((parameter) =>
      cubicPoint(start, control1, control2, endpoint, parameter),
    ),
    maximumMagnitude,
  );
}

function addCubicExtrema(
  parameters: Set<number>,
  start: number,
  control1: number,
  control2: number,
  endpoint: number,
): void {
  const roots = solveQuadratic(
    -start + 3 * control1 - 3 * control2 + endpoint,
    2 * (start - 2 * control1 + control2),
    control1 - start,
  );
  for (const parameter of roots) {
    if (parameter > 0 && parameter < 1 && Number.isFinite(parameter)) {
      parameters.add(parameter);
    }
  }
}

function solveQuadratic(a: number, b: number, c: number): number[] {
  if (a === 0) return b === 0 ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  const tolerance = Number.EPSILON * 64 * Math.max(1, b * b + Math.abs(4 * a * c));
  if (discriminant < -tolerance) return [];
  const root = Math.sqrt(Math.max(0, discriminant));
  if (root === 0) return [-b / (2 * a)];
  const q = -0.5 * (b + (b < 0 ? -root : root));
  return q === 0 ? [-b / (2 * a)] : [q / a, c / q];
}

function cubicPoint(
  start: Point,
  control1: Point,
  control2: Point,
  endpoint: Point,
  parameter: number,
): Point {
  const remainder = 1 - parameter;
  return {
    x:
      remainder * remainder * remainder * start.x +
      3 * remainder * remainder * parameter * control1.x +
      3 * remainder * parameter * parameter * control2.x +
      parameter * parameter * parameter * endpoint.x,
    y:
      remainder * remainder * remainder * start.y +
      3 * remainder * remainder * parameter * control1.y +
      3 * remainder * parameter * parameter * control2.y +
      parameter * parameter * parameter * endpoint.y,
  };
}

function checkArcBounds(input: {
  start: Point;
  endpoint: Point;
  radiusX: number;
  radiusY: number;
  rotationDegrees: number;
  largeArc: boolean;
  sweep: boolean;
  maximumMagnitude: number;
}): ScenePathDataProblem | undefined {
  if (
    input.radiusX === 0 ||
    input.radiusY === 0 ||
    pointsEqual(input.start, input.endpoint)
  ) {
    return checkPoints([input.start, input.endpoint], input.maximumMagnitude);
  }

  const rotation = ((input.rotationDegrees % 360) * Math.PI) / 180;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const halfDeltaX = (input.start.x - input.endpoint.x) / 2;
  const halfDeltaY = (input.start.y - input.endpoint.y) / 2;
  const transformedStartX = cosine * halfDeltaX + sine * halfDeltaY;
  const transformedStartY = -sine * halfDeltaX + cosine * halfDeltaY;

  let radiusX = input.radiusX;
  let radiusY = input.radiusY;
  const radiiScaleSquared =
    (transformedStartX * transformedStartX) / (radiusX * radiusX) +
    (transformedStartY * transformedStartY) / (radiusY * radiusY);
  if (radiiScaleSquared > 1) {
    const scale = Math.sqrt(radiiScaleSquared);
    radiusX *= scale;
    radiusY *= scale;
  }

  const radiusXSquared = radiusX * radiusX;
  const radiusYSquared = radiusY * radiusY;
  const transformedStartXSquared = transformedStartX * transformedStartX;
  const transformedStartYSquared = transformedStartY * transformedStartY;
  const denominator =
    radiusXSquared * transformedStartYSquared +
    radiusYSquared * transformedStartXSquared;
  const numerator = Math.max(
    0,
    radiusXSquared * radiusYSquared -
      radiusXSquared * transformedStartYSquared -
      radiusYSquared * transformedStartXSquared,
  );
  const sign = input.largeArc === input.sweep ? -1 : 1;
  const coefficient = denominator === 0 ? 0 : sign * Math.sqrt(numerator / denominator);
  const transformedCenterX = coefficient * ((radiusX * transformedStartY) / radiusY);
  const transformedCenterY = coefficient * (-(radiusY * transformedStartX) / radiusX);
  const center = {
    x:
      cosine * transformedCenterX -
      sine * transformedCenterY +
      (input.start.x + input.endpoint.x) / 2,
    y:
      sine * transformedCenterX +
      cosine * transformedCenterY +
      (input.start.y + input.endpoint.y) / 2,
  };

  const startVector = {
    x: (transformedStartX - transformedCenterX) / radiusX,
    y: (transformedStartY - transformedCenterY) / radiusY,
  };
  const endVector = {
    x: (-transformedStartX - transformedCenterX) / radiusX,
    y: (-transformedStartY - transformedCenterY) / radiusY,
  };
  const startAngle = Math.atan2(startVector.y, startVector.x);
  let sweepAngle = signedAngle(startVector, endVector);
  if (!input.sweep && sweepAngle > 0) sweepAngle -= 2 * Math.PI;
  if (input.sweep && sweepAngle < 0) sweepAngle += 2 * Math.PI;

  const xExtremum = Math.atan2(-radiusY * sine, radiusX * cosine);
  const yExtremum = Math.atan2(radiusY * cosine, radiusX * sine);
  const candidateAngles = [
    startAngle,
    startAngle + sweepAngle,
    xExtremum,
    xExtremum + Math.PI,
    yExtremum,
    yExtremum + Math.PI,
  ];
  const candidates = candidateAngles
    .filter(
      (angle, index) => index < 2 || angleFallsOnArc(angle, startAngle, sweepAngle),
    )
    .map((angle) => arcPoint(center, radiusX, radiusY, cosine, sine, angle));
  return checkComputedPoints(candidates, input.maximumMagnitude);
}

function signedAngle(start: Point, end: Point): number {
  return Math.atan2(
    start.x * end.y - start.y * end.x,
    start.x * end.x + start.y * end.y,
  );
}

function angleFallsOnArc(angle: number, start: number, sweep: number): boolean {
  const angleTolerance = Number.EPSILON * 64;
  return sweep >= 0
    ? positiveAngle(angle - start) <= sweep + angleTolerance
    : positiveAngle(start - angle) <= -sweep + angleTolerance;
}

function positiveAngle(angle: number): number {
  const fullTurn = 2 * Math.PI;
  const normalized = angle % fullTurn;
  return normalized < 0 ? normalized + fullTurn : normalized;
}

function arcPoint(
  center: Point,
  radiusX: number,
  radiusY: number,
  rotationCosine: number,
  rotationSine: number,
  angle: number,
): Point {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: center.x + radiusX * rotationCosine * cosine - radiusY * rotationSine * sine,
    y: center.y + radiusX * rotationSine * cosine + radiusY * rotationCosine * sine,
  };
}

function pointsEqual(left: Point, right: Point): boolean {
  return left.x === right.x && left.y === right.y;
}

function checkPoints(
  points: readonly Point[],
  maximumMagnitude: number,
): ScenePathDataProblem | undefined {
  return points.some(
    (point) =>
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      Math.abs(point.x) > maximumMagnitude ||
      Math.abs(point.y) > maximumMagnitude,
  )
    ? boundsProblem(maximumMagnitude)
    : undefined;
}

function checkComputedPoints(
  points: readonly Point[],
  maximumMagnitude: number,
): ScenePathDataProblem | undefined {
  const tolerance = Number.EPSILON * 64 * Math.max(1, maximumMagnitude);
  return points.some(
    (point) =>
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      Math.abs(point.x) > maximumMagnitude + tolerance ||
      Math.abs(point.y) > maximumMagnitude + tolerance,
  )
    ? boundsProblem(maximumMagnitude)
    : undefined;
}

function isWhitespace(value: string): boolean {
  return value === " " || value === "\t" || value === "\n" || value === "\r";
}

function isOnSerializationGrid(value: number, resolution: number): boolean {
  const units = value / resolution;
  return Math.abs(units - Math.round(units)) <= 1e-9;
}

function syntaxProblem(message: string): ScenePathDataProblem {
  return { code: "SCENE_PATH_DATA_SYNTAX_INVALID", message };
}

function boundsProblem(maximumMagnitude: number): ScenePathDataProblem {
  return {
    code: "SCENE_PATH_GEOMETRY_OUT_OF_BOUNDS",
    message: `Resolved path geometry must stay within ±${maximumMagnitude.toString()}.`,
  };
}
