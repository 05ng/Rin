import { useState, useEffect, useRef, useContext, useCallback } from "react";
import type { MouseEvent } from "react";
import { client } from "../app/runtime";
import { ProfileContext } from "../state/profile";

type OrderType = "burger" | "hotdog" | "icecream" | "coffee";

// --- Game Constants & Coordinates ---
const PERFECT_DAY_LENGTH_SECONDS = 480;
const SHORT_DAY_LENGTH_SECONDS = 180;
const INITIAL_DAY_LENGTH_SECONDS = PERFECT_DAY_LENGTH_SECONDS;
const MATH_QUESTION_COUNT = 10;
const MATH_MAX_NUMBER = 20;
const MIN_CORRECT_TO_OPEN = 8;
const GAME_WIDTH = 800;
const GAME_HEIGHT = 500;
const MOVE_SPEED = 150; // pixels per second

const TABLE_COST = 50;
const HELPER_COST = 60;
const SHOP_COST = 200;
const HELPER_DAILY_SALARY = 20;
const RESTAURANT_GAME_STATE_KEY = "restaurant_game_state";

const TABLE_SELL_VALUE = TABLE_COST;
const SHOP_SELL_VALUE = SHOP_COST;

const MENU_PRICES: Record<OrderType, number> = { burger: 5, hotdog: 3, coffee: 2, icecream: 1 };
const MENU_EMOJIS: Record<OrderType, string> = { burger: "🍔", hotdog: "🌭", coffee: "☕", icecream: "🍦" };
const MACHINE_COOK_TIME: Record<OrderType, number> = { burger: 5, hotdog: 4, coffee: 4, icecream: 3 };

const TABLE_POSITIONS = [
  { x: 250, y: 150 }, { x: 450, y: 150 }, { x: 650, y: 150 },
  { x: 250, y: 300 }, { x: 450, y: 300 }, { x: 650, y: 300 },
  { x: 250, y: 450 }, { x: 450, y: 450 }, { x: 650, y: 450 },
];

const MACHINE_POSITIONS: Record<OrderType, Pos> = {
  burger: { x: 750, y: 150 },
  hotdog: { x: 750, y: 250 },
  coffee: { x: 750, y: 350 },
  icecream: { x: 750, y: 450 }
};

const SPAWN_POINT = { x: 50, y: GAME_HEIGHT + 50 };
const EXIT_POINT = { x: -50, y: -50 };
const OWNER_SPAWN = { x: GAME_WIDTH - 200, y: GAME_HEIGHT - 50 };
const HELPER_SPAWN = { x: GAME_WIDTH - 250, y: GAME_HEIGHT - 50 };
const GATE_POS = { x: 110, y: GAME_HEIGHT - 55 };
const GATE_TRIGGER_DISTANCE = 28;

// --- Entity Types ---
type Pos = { x: number; y: number };

type TableState = {
  id: number;
  pos: Pos;
  state: "empty" | "waiting" | "eating" | "cash_ready";
  customerId?: number;
  order?: OrderType;
  timer?: number;
};

type CustomerState = {
  id: number;
  order: OrderType;
  pos: Pos;
  target?: Pos;
  phase: "queue" | "walking_to_table" | "seated" | "leaving" | "gone";
  tableId?: number;
  queueIndex?: number;
  moving?: boolean;
  facingLeft?: boolean;
};

type Task =
  | { type: "grab", order: OrderType, targetPos: Pos }
  | { type: "serve", tableId: number, targetPos: Pos, order: OrderType }
  | { type: "collect", tableId: number, targetPos: Pos };

type StaffState = {
  id: number;
  pos: Pos;
  inventory: OrderType[];
  tasks: Task[];
  moving?: boolean;
  facingLeft?: boolean;
};

type MachineState = {
  type: OrderType;
  stock: number;
  timer: number; // time until next stock
};

type RestaurantShopRuntimeState = {
  tables: TableState[];
  customers: CustomerState[];
  helpers: StaffState[];
  machines: MachineState[];
};

type MathQuestion = {
  id: number;
  left: number;
  right: number;
  operator: "+" | "-";
  answer: number;
};

type MathGateResult = {
  correct: number;
  wrong: number;
  openingSeconds: number | null;
};

type MathGateState = {
  isOpen: boolean;
  questions: MathQuestion[];
  answers: string[];
  result: MathGateResult | null;
};

type SavedShopState = {
  tables: number;
  helpers: number;
};

// --- Helper Functions ---
function distance(p1: Pos, p2: Pos) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}
function moveTowards(current: Pos, target: Pos, speed: number, dt: number): Pos {
  const dist = distance(current, target);
  if (dist === 0) return { ...target };
  const step = Math.max(0, speed * dt);
  if (dist <= step) return { ...target };
  return {
    x: current.x + (target.x - current.x) / dist * step,
    y: current.y + (target.y - current.y) / dist * step,
  };
}
function getQueuePos(index: number): Pos {
  return { x: 50, y: 150 + index * 60 };
}

function getHelperRestPos(id: number): Pos {
  return { x: HELPER_SPAWN.x - id * 30, y: HELPER_SPAWN.y };
}

function createTables(count: number): TableState[] {
  return Array.from({ length: count }).map((_, i) => ({
    id: i + 1,
    pos: TABLE_POSITIONS[i],
    state: "empty",
  }));
}

function createHelpers(count: number): StaffState[] {
  return Array.from({ length: count }).map((_, i) => ({
    id: i + 1,
    pos: getHelperRestPos(i + 1),
    inventory: [],
    tasks: [],
  }));
}

function createMachines(): MachineState[] {
  return [
    { type: "burger", stock: 0, timer: 0 },
    { type: "hotdog", stock: 0, timer: 0 },
    { type: "coffee", stock: 0, timer: 0 },
    { type: "icecream", stock: 0, timer: 0 },
  ];
}

function createShopRuntimeState(savedShop: SavedShopState): RestaurantShopRuntimeState {
  return {
    tables: createTables(savedShop.tables),
    customers: [],
    helpers: createHelpers(savedShop.helpers),
    machines: createMachines(),
  };
}

function randomInt(maxInclusive: number) {
  return Math.floor(Math.random() * (maxInclusive + 1));
}

function generateMathQuestion(id: number): MathQuestion {
  const operator = Math.random() < 0.5 ? "+" : "-";

  if (operator === "+") {
    const left = randomInt(MATH_MAX_NUMBER);
    const right = randomInt(MATH_MAX_NUMBER - left);
    return { id, left, right, operator, answer: left + right };
  }

  const left = randomInt(MATH_MAX_NUMBER);
  const right = randomInt(left);
  return { id, left, right, operator, answer: left - right };
}

function generateOpeningTestQuestions() {
  return Array.from({ length: MATH_QUESTION_COUNT }, (_, index) => generateMathQuestion(index + 1));
}

function createOpeningTestState(): MathGateState {
  return {
    isOpen: true,
    questions: generateOpeningTestQuestions(),
    answers: Array.from({ length: MATH_QUESTION_COUNT }, () => ""),
    result: null,
  };
}

function closedMathGateState(): MathGateState {
  return {
    isOpen: false,
    questions: [],
    answers: [],
    result: null,
  };
}

type SavedRestaurantGameState = {
  money: number;
  tables: number;
  helpers: number;
  shops: number;
  activeShop: number;
  payrollDue: number;
  shopStates: SavedShopState[];
};

function readSavedNumber(value: unknown, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function normalizeSavedRestaurantGameState(raw: unknown): SavedRestaurantGameState {
  const source = raw && typeof raw === "object"
    && "data" in raw
    && (raw as { data?: unknown }).data
    && typeof (raw as { data?: unknown }).data === "object"
    ? (raw as { data: unknown }).data
    : raw;

  const state = source && typeof source === "object"
    ? source as Record<string, unknown>
    : {};

  const shops = readSavedNumber(state.shops, 1, 1);
  const activeShop = readSavedNumber(state.activeShop, 1, 1, shops);
  const legacyTables = readSavedNumber(state.tables, 1, 1, TABLE_POSITIONS.length);
  const legacyHelpers = readSavedNumber(state.helpers, 0, 0);
  const rawShopStates = Array.isArray(state.shopStates) ? state.shopStates : [];
  const shopStates = Array.from({ length: shops }).map((_, index) => {
    const rawShop = rawShopStates[index];
    const shop = rawShop && typeof rawShop === "object"
      ? rawShop as Record<string, unknown>
      : {};
    return {
      tables: readSavedNumber(shop.tables, index === 0 ? legacyTables : 1, 1, TABLE_POSITIONS.length),
      helpers: readSavedNumber(shop.helpers, index === 0 ? legacyHelpers : 0, 0),
    };
  });
  const currentShop = shopStates[activeShop - 1] ?? { tables: 1, helpers: 0 };

  return {
    money: readSavedNumber(state.money, 0, 0),
    tables: currentShop.tables,
    helpers: currentShop.helpers,
    shops,
    activeShop,
    payrollDue: readSavedNumber(state.payrollDue, 0, 0),
    shopStates,
  };
}

function loadLocalRestaurantGameState() {
  try {
    const saved = localStorage.getItem(RESTAURANT_GAME_STATE_KEY);
    return saved ? normalizeSavedRestaurantGameState(JSON.parse(saved)) : null;
  } catch {
    return null;
  }
}

function saveLocalRestaurantGameState(state: SavedRestaurantGameState) {
  localStorage.setItem(RESTAURANT_GAME_STATE_KEY, JSON.stringify(state));
}

export function RestaurantGamePage() {
  const profile = useContext(ProfileContext);

  // High-level state
  const [money, setMoney] = useState(0);
  const [timeLeft, setTimeLeft] = useState(INITIAL_DAY_LENGTH_SECONDS);
  const [dayRunning, setDayRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [mathGate, setMathGate] = useState<MathGateState>(() => closedMathGateState());

  // Game Entities Refs (mutable for loop)
  const stateRef = useRef({
    tables: [] as TableState[],
    customers: [] as CustomerState[],
    helpers: [] as StaffState[],
    owner: { id: 0, pos: { ...OWNER_SPAWN }, inventory: [], tasks: [] } as StaffState,
    machines: createMachines(),
    shops: [createShopRuntimeState({ tables: 1, helpers: 0 })] as RestaurantShopRuntimeState[],
    money: 0,
    helpersCount: 0,
    shopCount: 1,
    activeShop: 1,
    ownerManualTarget: undefined as Pos | undefined,
    pendingGateTravel: false,
    customerIdCounter: 1,
    timeAccumulator: 0,
  });

  // For rendering only
  const [, setRenderTrigger] = useState(0);
  const [tableCount, setTableCount] = useState(1);
  const [helperCount, setHelperCount] = useState(0);
  const [shopCount, setShopCount] = useState(1);
  const [activeShop, setActiveShop] = useState(1);
  const [payrollDue, setPayrollDue] = useState(0);

  const savedStateLoaded = useRef(false);
  const remoteStateLoaded = useRef(false);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [boardScale, setBoardScale] = useState(1);

  const ensureShopRuntime = useCallback((shopNumber: number) => {
    const s = stateRef.current;
    const index = Math.max(0, Math.floor(shopNumber) - 1);
    while (s.shops.length <= index) {
      s.shops.push(createShopRuntimeState({ tables: 1, helpers: 0 }));
    }
    return s.shops[index];
  }, []);

  const persistActiveShopRuntime = useCallback(() => {
    const s = stateRef.current;
    const index = Math.max(0, s.activeShop - 1);
    if (!s.shops[index]) return;
    s.shops[index] = {
      tables: s.tables,
      customers: s.customers,
      helpers: s.helpers,
      machines: s.machines,
    };
  }, []);

  const activateShop = useCallback((shopNumber: number, ownerPos?: Pos, persistCurrent = true) => {
    const s = stateRef.current;
    if (persistCurrent) {
      persistActiveShopRuntime();
    }
    const normalizedShop = Math.min(
      Math.max(1, Math.floor(shopNumber)),
      Math.max(1, s.shopCount),
    );
    const shop = ensureShopRuntime(normalizedShop);

    s.activeShop = normalizedShop;
    s.tables = shop.tables;
    s.customers = shop.customers;
    s.helpers = shop.helpers;
    s.machines = shop.machines;
    s.helpersCount = shop.helpers.length;
    s.owner.tasks = [];
    s.owner.inventory = [];
    s.ownerManualTarget = undefined;
    s.pendingGateTravel = false;
    if (ownerPos) {
      s.owner.pos = { ...ownerPos };
    }

    setActiveShop(normalizedShop);
    setTableCount(shop.tables.length);
    setHelperCount(shop.helpers.length);
    setRenderTrigger(v => v + 1);
  }, [ensureShopRuntime, persistActiveShopRuntime]);

  // Responsive scaling
  useEffect(() => {
    const el = boardContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        setBoardScale(Math.min(1, w / GAME_WIDTH));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Initialize
  useEffect(() => {
    if (savedStateLoaded.current && (!profile || remoteStateLoaded.current)) {
      return;
    }

    const load = async () => {
      const localState = loadLocalRestaurantGameState();
      let loadedState = localState ?? normalizeSavedRestaurantGameState(null);

      if (profile && !remoteStateLoaded.current) {
        try {
          const res = await client.game?.loadRestaurantState();
          if (res?.data) {
            loadedState = normalizeSavedRestaurantGameState(res.data);
            saveLocalRestaurantGameState(loadedState);
          }
        } catch (e) {
          console.warn("Failed to load remote restaurant game state", e);
        }
        remoteStateLoaded.current = true;
      }

      setMoney(loadedState.money);
      setShopCount(loadedState.shops);
      setPayrollDue(loadedState.payrollDue);

      stateRef.current.money = loadedState.money;
      stateRef.current.shopCount = loadedState.shops;
      stateRef.current.shops = loadedState.shopStates.map(createShopRuntimeState);
      activateShop(loadedState.activeShop, undefined, false);

      savedStateLoaded.current = true;
    };

    load();
  }, [profile, activateShop]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const openShopFor = (seconds: number) => {
    setTimeLeft(seconds);
    setDayRunning(true);
    setMathGate(closedMathGateState());
    setMessage(`Shop opened for ${formatTime(seconds)}!`);
    setTimeout(() => setMessage(""), 2000);
  };

  const startOpeningTest = () => {
    if (dayRunning) return;
    if (payrollDue > 0) {
      setMessage(`Pay the remaining $${payrollDue} helper salary before opening.`);
      setTimeout(() => setMessage(""), 2400);
      return;
    }
    setMessage("");
    setMathGate(createOpeningTestState());
  };

  const updateOpeningTestAnswer = (index: number, value: string) => {
    if (!/^-?\d*$/.test(value)) return;
    setMathGate(current => {
      const nextAnswers = [...current.answers];
      nextAnswers[index] = value;
      return { ...current, answers: nextAnswers, result: null };
    });
  };

  const retryOpeningTest = () => {
    setMathGate(createOpeningTestState());
  };

  const submitOpeningTest = () => {
    if (mathGate.answers.some(answer => answer.trim() === "")) {
      setMessage("Answer all 10 questions before opening the shop.");
      setTimeout(() => setMessage(""), 2000);
      return;
    }

    const correct = mathGate.questions.reduce((count, question, index) => {
      return Number(mathGate.answers[index]) === question.answer ? count + 1 : count;
    }, 0);
    const wrong = MATH_QUESTION_COUNT - correct;

    const openingSeconds = correct >= MIN_CORRECT_TO_OPEN
      ? wrong === 0 ? PERFECT_DAY_LENGTH_SECONDS : SHORT_DAY_LENGTH_SECONDS
      : null;

    setMathGate(current => ({
      ...current,
      result: { correct, wrong, openingSeconds },
    }));
  };

  const saveProgress = async () => {
    persistActiveShopRuntime();
    const currentState = stateRef.current;
    const shops = Math.max(1, currentState.shopCount);
    const activeShopNumber = Math.min(Math.max(1, currentState.activeShop), shops);
    const shopStates = Array.from({ length: shops }).map((_, index) => {
      const shop = currentState.shops[index] ?? createShopRuntimeState({ tables: 1, helpers: 0 });
      return {
        tables: Math.min(shop.tables.length, TABLE_POSITIONS.length),
        helpers: Math.max(0, shop.helpers.length),
      };
    });
    const currentShop = shopStates[activeShopNumber - 1] ?? { tables: 1, helpers: 0 };
    const st: SavedRestaurantGameState = {
      money: currentState.money,
      helpers: currentShop.helpers,
      tables: currentShop.tables,
      shops,
      activeShop: activeShopNumber,
      payrollDue: Math.max(0, payrollDue),
      shopStates,
    };
    saveLocalRestaurantGameState(st);

    if (profile) {
      const res = await client.game?.saveRestaurantState(st);
      setMessage(res?.error ? "Game saved locally. Remote save failed." : "Game saved!");
    } else {
      setMessage("Game saved locally!");
    }
    setTimeout(() => setMessage(""), 2000);
  };

  const settlePayroll = (amount: number) => {
    if (amount <= 0 || payrollDue <= 0) return;

    const remaining = payrollDue - amount;
    if (remaining > 0) {
      setPayrollDue(remaining);
      setMessage(`Sold asset for $${amount}. Payroll still needs $${remaining}.`);
      return;
    }

    const extra = Math.abs(remaining);
    if (extra > 0) {
      stateRef.current.money += extra;
      setMoney(stateRef.current.money);
    }
    setPayrollDue(0);
    setMessage("Helper salary paid. The shop can open again.");
  };

  const travelToNextShop = useCallback(() => {
    const s = stateRef.current;
    const nextShop = s.activeShop >= s.shopCount ? 1 : s.activeShop + 1;
    activateShop(nextShop, { x: GATE_POS.x + 80, y: GATE_POS.y });
    setMessage(`Moved through the gate to Shop #${nextShop}.`);
  }, [activateShop]);

  const handleDayEnd = useCallback(() => {
    const s = stateRef.current;
    const salaryDue = s.helpersCount * HELPER_DAILY_SALARY;

    if (salaryDue === 0) {
      setMessage("Day over! Finishing up active customers...");
      return;
    }

    if (s.money >= salaryDue) {
      s.money -= salaryDue;
      setMoney(s.money);
      setPayrollDue(0);
      setMessage(`Day over! Paid $${salaryDue} helper salary.`);
      return;
    }

    const remaining = salaryDue - s.money;
    s.money = 0;
    setMoney(0);
    setPayrollDue(remaining);
    setMessage(`Day over! Helper salary still needs $${remaining}. Sell a table or shop to pay it.`);
  }, []);

  // Main Game Loop
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      let dt = (time - lastTime) / 1000;
      if (dt < 0 || dt > 1) dt = 0.016;
      lastTime = time;

      if (dayRunning) {
        const s = stateRef.current;

        // Time management
        s.timeAccumulator += dt;
        if (s.timeAccumulator >= 1) {
          s.timeAccumulator -= 1;
          setTimeLeft(prev => {
            if (prev <= 1) {
              setDayRunning(false);
              handleDayEnd();
              return 0;
            }
            return prev - 1;
          });

          // Spawning customers (every second check, ~20% chance)
          if (Math.random() < 0.2 && s.customers.filter(c => c.phase === "queue").length < 6) {
            const orderTypes: OrderType[] = ["burger", "hotdog", "icecream", "coffee"];
            s.customers.push({
              id: s.customerIdCounter++,
              order: orderTypes[Math.floor(Math.random() * orderTypes.length)],
              pos: { ...SPAWN_POINT },
              phase: "queue"
            });
          }
        }

        // --- Logic Updates ---

        // 0. Machine Production (per-type cook times)
        s.machines.forEach(m => {
          const cookTime = MACHINE_COOK_TIME[m.type];
          m.timer += dt;
          if (m.timer >= cookTime) {
            m.stock++;
            m.timer -= cookTime;
          }
        });

        // 1. Assign Tables to Queue
        const queueCustomers = s.customers.filter(c => c.phase === "queue");
        queueCustomers.forEach((c, index) => {
          c.queueIndex = index;
          c.target = getQueuePos(index);
        });

        const firstInQueue = queueCustomers[0];
        if (firstInQueue) {
          const emptyTable = s.tables.find(t => t.state === "empty");
          if (emptyTable) {
            emptyTable.state = "waiting";
            emptyTable.customerId = firstInQueue.id;
            emptyTable.order = firstInQueue.order;

            firstInQueue.phase = "walking_to_table";
            firstInQueue.target = { ...emptyTable.pos };
            firstInQueue.tableId = emptyTable.id;
          }
        }

        // 2. Customers Movement & Logic
        s.customers.forEach(c => {
          if (c.target) {
            const prevX = c.pos.x;
            c.pos = moveTowards(c.pos, c.target, MOVE_SPEED, dt);
            const isMoving = distance(c.pos, c.target) >= 1;
            c.moving = isMoving;
            if (c.pos.x !== prevX) c.facingLeft = c.pos.x < prevX;
            if (!isMoving) {
              if (c.phase === "walking_to_table") {
                c.phase = "seated";
              } else if (c.phase === "leaving") {
                c.phase = "gone";
              }
            }
          } else {
            c.moving = false;
          }
        });
        s.customers = s.customers.filter(c => c.phase !== "gone");

        // 3. Tables Logic (Eating timers)
        s.tables.forEach(t => {
          if (t.state === "eating" && t.timer !== undefined) {
            t.timer -= dt;
            if (t.timer <= 0) {
              t.state = "cash_ready";
              t.timer = undefined;
              const cust = s.customers.find(c => c.id === t.customerId);
              if (cust) {
                cust.phase = "leaving";
                cust.target = { ...EXIT_POINT };
              }
            }
          }
        });

        // Helper Function for Staff Logic (Owner & Helpers)
        const processStaff = (staff: StaffState, isOwner: boolean) => {
          if (staff.tasks.length > 0) {
            const currentTask = staff.tasks[0];
            const prevX = staff.pos.x;
            staff.pos = moveTowards(staff.pos, currentTask.targetPos, MOVE_SPEED, dt);
            const isMoving = distance(staff.pos, currentTask.targetPos) >= 5;
            staff.moving = isMoving;
            if (staff.pos.x !== prevX) staff.facingLeft = staff.pos.x < prevX;

            if (!isMoving) {
              if (currentTask.type === "grab") {
                const machine = s.machines.find(m => m.type === currentTask.order);
                // Wait for stock if none available
                if (machine && machine.stock > 0) {
                  machine.stock--;
                  staff.inventory.push(currentTask.order);
                  staff.tasks.shift();
                }
              } else if (currentTask.type === "serve") {
                const t = s.tables.find(table => table.id === currentTask.tableId);
                if (t && t.state === "waiting") {
                  // Only serve if we have the correct item
                  const invIndex = staff.inventory.indexOf(currentTask.order);
                  if (invIndex !== -1) {
                    staff.inventory.splice(invIndex, 1);
                    t.state = "eating";
                    t.timer = 5;
                  }
                }
                // Even if we couldn't serve (e.g. table changed state), pop the task
                staff.tasks.shift();
              } else if (currentTask.type === "collect") {
                const t = s.tables.find(table => table.id === currentTask.tableId);
                if (t && t.state === "cash_ready") {
                  s.money += MENU_PRICES[t.order!];
                  setMoney(s.money);
                  t.state = "empty";
                  t.customerId = undefined;
                  t.order = undefined;
                }
                staff.tasks.shift();
              }
            }
          } else if (isOwner && s.ownerManualTarget) {
            const prevX = staff.pos.x;
            staff.pos = moveTowards(staff.pos, s.ownerManualTarget, MOVE_SPEED, dt);
            const reachedTarget = distance(staff.pos, s.ownerManualTarget) < 4;
            staff.moving = !reachedTarget;
            if (staff.pos.x !== prevX) staff.facingLeft = staff.pos.x < prevX;

            if (reachedTarget) {
              if (s.pendingGateTravel && distance(staff.pos, GATE_POS) <= GATE_TRIGGER_DISTANCE) {
                travelToNextShop();
                staff.pos = { x: GATE_POS.x + 80, y: GATE_POS.y };
              }
              s.pendingGateTravel = false;
              s.ownerManualTarget = undefined;
              staff.moving = false;
            }
          } else {
            // Idle movement
            const spawnPoint = isOwner ? OWNER_SPAWN : getHelperRestPos(staff.id);
            const prevX = staff.pos.x;
            staff.pos = moveTowards(staff.pos, spawnPoint, MOVE_SPEED / 2, dt);
            staff.moving = distance(staff.pos, spawnPoint) >= 2;
            if (staff.pos.x !== prevX) staff.facingLeft = staff.pos.x < prevX;
          }
        };

        // 4. Owner Logic
        processStaff(s.owner, true);

        // 5. Helpers Logic
        s.helpers.forEach(h => {
          processStaff(h, false);

          // AI Logic: Find tasks if we have capacity
          const projectedInventoryCount = h.inventory.length + h.tasks.filter(t => t.type === 'grab').length;

          if (projectedInventoryCount < 3) {
            // Find a table waiting that isn't being served by ANYONE (Owner or other Helpers)
            const isTableBeingServed = (tableId: number) => {
              if (s.owner.tasks.some(t => t.type === 'serve' && t.tableId === tableId)) return true;
              return s.helpers.some(helper => helper.tasks.some(t => t.type === 'serve' && t.tableId === tableId));
            };

            const waitingTable = s.tables.find(t => t.state === "waiting" && !isTableBeingServed(t.id));

            if (waitingTable && waitingTable.order) {
              const order = waitingTable.order;
              // Queue grab -> serve
              h.tasks.push({ type: "grab", order, targetPos: { ...MACHINE_POSITIONS[order] } });
              h.tasks.push({ type: "serve", tableId: waitingTable.id, order, targetPos: { ...waitingTable.pos } });
            }
          }
        });

      } else {
        // Not running: clear queue gradually, staff goes idle
        const s = stateRef.current;
        s.customers.forEach(c => {
          if (c.phase === "queue") {
            c.phase = "leaving";
            c.target = { ...EXIT_POINT };
          }
          if (c.target) {
            c.pos = moveTowards(c.pos, c.target, MOVE_SPEED, dt);
            if (distance(c.pos, c.target) < 1 && c.phase === "leaving") c.phase = "gone";
          }
        });
        s.customers = s.customers.filter(c => c.phase !== "gone");

        if (s.ownerManualTarget) {
          const prevX = s.owner.pos.x;
          s.owner.pos = moveTowards(s.owner.pos, s.ownerManualTarget, MOVE_SPEED, dt);
          const reachedTarget = distance(s.owner.pos, s.ownerManualTarget) < 4;
          s.owner.moving = !reachedTarget;
          if (s.owner.pos.x !== prevX) s.owner.facingLeft = s.owner.pos.x < prevX;
          if (reachedTarget) {
            if (s.pendingGateTravel && distance(s.owner.pos, GATE_POS) <= GATE_TRIGGER_DISTANCE) {
              travelToNextShop();
              s.owner.pos = { x: GATE_POS.x + 80, y: GATE_POS.y };
            }
            s.pendingGateTravel = false;
            s.ownerManualTarget = undefined;
          }
        } else {
          s.owner.pos = moveTowards(s.owner.pos, OWNER_SPAWN, MOVE_SPEED / 2, dt);
        }
        s.helpers.forEach(h => {
          h.pos = moveTowards(h.pos, getHelperRestPos(h.id), MOVE_SPEED / 2, dt);
        });
      }

      setRenderTrigger(v => v + 1);
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [dayRunning, handleDayEnd, travelToNextShop]);

  // Click Handlers
  const handleTableClick = (table: TableState) => {
    console.log("Table clicked!", table.state);
    const s = stateRef.current;

    // Check if table is already targeted by Owner
    if (s.owner.tasks.some(t => ('tableId' in t) && t.tableId === table.id)) {
      return; // Already handling this table
    }

    s.ownerManualTarget = undefined;
    s.pendingGateTravel = false;

    if (table.state === "waiting" && table.order) {
      const projectedInventory = s.owner.inventory.length + s.owner.tasks.filter(t => t.type === 'grab').length;
      if (projectedInventory < 3) {
         s.owner.tasks.push({ type: "grab", order: table.order, targetPos: { ...MACHINE_POSITIONS[table.order] } });
         s.owner.tasks.push({ type: "serve", tableId: table.id, order: table.order, targetPos: { ...table.pos } });
      }
    } else if (table.state === "cash_ready") {
      // Collecting doesn't use inventory, we can queue unlimited collects
      s.owner.tasks.push({ type: "collect", tableId: table.id, targetPos: { ...table.pos } });
    }
  };

  const handleBoardClick = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const target = {
      x: (event.clientX - rect.left) / boardScale,
      y: (event.clientY - rect.top) / boardScale,
    };

    stateRef.current.owner.tasks = [];
    stateRef.current.ownerManualTarget = target;
    stateRef.current.pendingGateTravel = shopCount > 1 && distance(target, GATE_POS) <= GATE_TRIGGER_DISTANCE;
  };

  const handleGateClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (shopCount <= 1) {
      setMessage("Buy another shop before using the gate.");
      setTimeout(() => setMessage(""), 2000);
      return;
    }

    stateRef.current.owner.tasks = [];
    stateRef.current.ownerManualTarget = { ...GATE_POS };
    stateRef.current.pendingGateTravel = true;
  };

  const buyTable = () => {
    const s = stateRef.current;
    if (s.money >= TABLE_COST && s.tables.length < TABLE_POSITIONS.length) {
      s.money -= TABLE_COST;
      setMoney(s.money);
      const newIndex = s.tables.length;
      s.tables.push({ id: newIndex + 1, pos: TABLE_POSITIONS[newIndex], state: "empty" });
      setTableCount(s.tables.length);
    }
  };

  const buyShop = () => {
    const s = stateRef.current;
    if (s.money >= SHOP_COST) {
      s.money -= SHOP_COST;
      s.shopCount += 1;
      s.shops.push(createShopRuntimeState({ tables: 1, helpers: 0 }));
      setMoney(s.money);
      setShopCount(s.shopCount);
      setMessage(`Bought Shop #${s.shopCount}. Use the gate to visit it.`);
    }
  };

  const sellTableForPayroll = () => {
    const s = stateRef.current;
    const tableIndex = s.tables.findLastIndex(table => table.state === "empty");
    if (tableIndex <= 0) {
      setMessage("No extra empty table is available to sell.");
      return;
    }

    s.tables.splice(tableIndex, 1);
    setTableCount(s.tables.length);
    settlePayroll(TABLE_SELL_VALUE);
  };

  const sellShopForPayroll = () => {
    const s = stateRef.current;
    if (s.shopCount <= 1) {
      setMessage("No extra shop is available to sell.");
      return;
    }

    s.shopCount -= 1;
    s.shops.splice(s.shopCount);
    setShopCount(s.shopCount);
    if (s.activeShop > s.shopCount) {
      activateShop(s.shopCount, OWNER_SPAWN);
    }
    settlePayroll(SHOP_SELL_VALUE);
  };

  const hireHelper = () => {
    const s = stateRef.current;
    if (s.money >= HELPER_COST) {
      s.money -= HELPER_COST;
      setMoney(s.money);
      const helperId = s.helpers.length + 1;
      s.helpers.push({
        id: helperId,
        pos: { x: SPAWN_POINT.x, y: SPAWN_POINT.y },
        inventory: [],
        tasks: []
      });
      s.helpersCount = s.helpers.length;
      setHelperCount(s.helpersCount);
    }
  };

  const s = stateRef.current;
  const canSellTableForPayroll = payrollDue > 0 && s.tables.some((table, index) => index > 0 && table.state === "empty");
  const canSellShopForPayroll = payrollDue > 0 && shopCount > 1;

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-900 text-white select-none">

      {/* Top UI Bar */}
      <div className="flex flex-wrap justify-between items-center p-4 bg-gray-800 shadow-md z-10">
        <div className="text-2xl font-bold text-orange-400">🍔 Burger Shop #{activeShop}</div>

        <div className="flex items-center gap-6">
          <div className="text-xl font-mono text-green-400 border border-green-500 rounded px-3 py-1">
            💵 ${money}
          </div>
          <div className="text-xl font-mono">
            ⏱️ {formatTime(timeLeft)}
          </div>
          <div className="text-sm font-semibold text-zinc-300">
            Shops {activeShop}/{shopCount}
          </div>
          {payrollDue > 0 && (
            <div className="rounded border border-red-500 bg-red-950/60 px-3 py-1 text-sm font-bold text-red-100">
              Salary due: ${payrollDue}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {!dayRunning && timeLeft > 0 && (
            <button onClick={startOpeningTest} disabled={payrollDue > 0} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 px-4 py-2 rounded font-bold transition">
              Open Shop
            </button>
          )}
          {!dayRunning && timeLeft <= 0 && (
            <button onClick={startOpeningTest} disabled={payrollDue > 0} className="bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:hover:bg-green-600 px-4 py-2 rounded font-bold transition">
              Start Next Day
            </button>
          )}
          <button onClick={saveProgress} className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded transition text-sm">
            💾 Save
          </button>
        </div>
      </div>

      {message && <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded shadow z-20 animate-pulse">{message}</div>}

      {mathGate.isOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-3xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg border border-orange-500/40 bg-zinc-900 p-5 shadow-2xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-orange-300">Opening Math Test</h2>
                <p className="mt-1 text-sm text-zinc-300">
                  Answer 10 plus/minus questions using numbers within 20. Perfect score opens for 8:00. One or two mistakes opens for 3:00. Three mistakes keeps the shop closed.
                </p>
              </div>
              <div className="shrink-0 rounded bg-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-200">
                Need {MIN_CORRECT_TO_OPEN}/10 correct
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {mathGate.questions.map((question, index) => {
                const answerValue = mathGate.answers[index] ?? "";
                const submitted = Boolean(mathGate.result);
                const answeredCorrectly = submitted && Number(answerValue) === question.answer;
                return (
                  <label key={question.id} className="flex items-center justify-between gap-3 rounded border border-zinc-700 bg-zinc-800 px-3 py-2">
                    <span className="min-w-0 text-lg font-semibold text-zinc-100">
                      {question.id}. {question.left} {question.operator} {question.right} =
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        inputMode="numeric"
                        value={answerValue}
                        onChange={event => updateOpeningTestAnswer(index, event.target.value)}
                        className="h-10 w-20 rounded border border-zinc-600 bg-zinc-950 px-3 text-center text-lg font-bold text-white outline-none focus:border-orange-400"
                        aria-label={`Answer for question ${question.id}`}
                      />
                      {submitted && answerValue.trim() !== "" && (
                        <span className={answeredCorrectly ? "text-green-400" : "text-red-400"}>
                          {answeredCorrectly ? "OK" : question.answer}
                        </span>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            {mathGate.result && (
              <div className={mathGate.result.openingSeconds === null
                ? "mt-4 rounded border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100"
                : "mt-4 rounded border border-green-500/40 bg-green-950/40 px-4 py-3 text-sm text-green-100"
              }>
                {mathGate.result.openingSeconds === null ? (
                  <>Score: {mathGate.result.correct}/10. The shop cannot open with {mathGate.result.wrong} wrong answers. Try a new set until you get at least 8 correct.</>
                ) : (
                  <>Score: {mathGate.result.correct}/10. The shop can open for {formatTime(mathGate.result.openingSeconds)}. Review your answers, then open the shop.</>
                )}
              </div>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setMathGate(closedMathGateState())}
                className="rounded border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
              >
                Cancel
              </button>
              {mathGate.result === null ? (
                <button
                  type="button"
                  onClick={submitOpeningTest}
                  className="rounded bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-500"
                >
                  Submit Answers
                </button>
              ) : mathGate.result.openingSeconds === null ? (
                <button
                  type="button"
                  onClick={retryOpeningTest}
                  className="rounded bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-500"
                >
                  Retry New Questions
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => openShopFor(mathGate.result!.openingSeconds!)}
                  className="rounded bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-500"
                >
                  Open Shop
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {payrollDue > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3 border-y border-red-500/40 bg-red-950/60 p-3 text-sm text-red-50 shadow-inner z-10">
          <span className="font-bold">Helper salary still needs ${payrollDue}.</span>
          <button
            onClick={sellTableForPayroll}
            disabled={!canSellTableForPayroll}
            className="rounded bg-orange-600 px-3 py-2 font-semibold hover:bg-orange-500 disabled:opacity-50 disabled:hover:bg-orange-600"
          >
            Sell Table (+${TABLE_SELL_VALUE})
          </button>
          <button
            onClick={sellShopForPayroll}
            disabled={!canSellShopForPayroll}
            className="rounded bg-red-600 px-3 py-2 font-semibold hover:bg-red-500 disabled:opacity-50 disabled:hover:bg-red-600"
          >
            Sell Shop (+${SHOP_SELL_VALUE})
          </button>
        </div>
      )}

      {/* Upgrades Bar */}
      <div className="flex flex-wrap justify-center gap-4 p-2 bg-gray-700 shadow-inner z-10">
        <button
          onClick={buyTable} disabled={money < TABLE_COST || tableCount >= 9}
          className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:hover:bg-orange-600 px-4 py-2 rounded transition text-sm flex items-center gap-2"
        >
          <span>🪑 Buy Table (${TABLE_COST})</span>
          <span className="bg-orange-800 px-2 rounded-full">{tableCount}/9</span>
        </button>
        <button
          onClick={buyShop} disabled={money < SHOP_COST}
          className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:hover:bg-sky-600 px-4 py-2 rounded transition text-sm flex items-center gap-2"
        >
          <span>🏪 Buy Shop (${SHOP_COST})</span>
          <span className="bg-sky-800 px-2 rounded-full">{shopCount}</span>
        </button>
        <button
          onClick={hireHelper} disabled={money < HELPER_COST}
          className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:hover:bg-purple-600 px-4 py-2 rounded transition text-sm flex items-center gap-2"
        >
          <span>🧑‍🍳 Hire Helper (${HELPER_COST})</span>
          <span className="bg-purple-800 px-2 rounded-full">{helperCount}</span>
        </button>
      </div>

      {/* Game Board Container */}
      <div ref={boardContainerRef} className="flex-1 overflow-hidden flex justify-center items-start p-1 bg-zinc-800">

        {/* Scaling wrapper */}
        <div style={{ width: GAME_WIDTH * boardScale, height: GAME_HEIGHT * boardScale }}>
        {/* Game Canvas */}
        <div
          onClick={handleBoardClick}
          className="relative cursor-crosshair bg-zinc-900 border-4 border-zinc-700 shadow-2xl rounded-xl overflow-hidden"
          style={{ width: GAME_WIDTH, height: GAME_HEIGHT, transform: `scale(${boardScale})`, transformOrigin: 'top left' }}
        >
          {/* Floor Decor */}
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

          <div className="absolute top-2 left-2 text-zinc-600 text-sm font-bold uppercase tracking-widest">Queue Area</div>
          <div className="absolute bottom-2 right-2 text-zinc-600 text-sm font-bold uppercase tracking-widest">Kitchen</div>
          <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded bg-zinc-800/90 px-3 py-1 text-xs font-bold uppercase tracking-widest text-zinc-300">
            Shop #{activeShop}
          </div>

          {/* Gate */}
          <div
            onClick={handleGateClick}
            className={`absolute -ml-10 -mt-10 flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-t-full border-4 shadow-lg transition ${
              shopCount > 1
                ? "border-cyan-400 bg-cyan-900/60 hover:bg-cyan-800/70"
                : "border-zinc-600 bg-zinc-800/70 opacity-70"
            }`}
            style={{ transform: `translate(${GATE_POS.x}px, ${GATE_POS.y}px)` }}
            title={shopCount > 1 ? "Gate to next shop" : "Buy another shop to unlock travel"}
          >
            <span className="text-3xl">🚪</span>
            <span className="text-[10px] font-bold uppercase text-zinc-100">Gate</span>
          </div>

          {/* Machines */}
          {s.machines.map(m => (
            <div
              key={`machine-${m.type}`}
              className="absolute w-20 h-20 -ml-10 -mt-10 bg-zinc-700 border-2 border-zinc-500 rounded-lg flex flex-col items-center justify-center shadow-lg"
              style={{ transform: `translate(${MACHINE_POSITIONS[m.type].x}px, ${MACHINE_POSITIONS[m.type].y}px)` }}
            >
               <div className="text-3xl">{MENU_EMOJIS[m.type]}</div>
               <div className="absolute -top-3 -right-3 bg-red-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center border-2 border-zinc-900">
                 {m.stock}
               </div>
            </div>
          ))}

          {/* Tables */}
          {s.tables.map(t => (
            <div
              key={`table-${t.id}`}
              onClick={(event) => { event.stopPropagation(); handleTableClick(t); }}
              className={`absolute w-24 h-24 -ml-12 -mt-12 rounded-lg border-4 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                t.state === 'empty' ? 'bg-zinc-800 border-zinc-600 hover:border-zinc-500' :
                t.state === 'waiting' ? 'bg-yellow-900/50 border-yellow-600 hover:bg-yellow-800/50' :
                t.state === 'eating' ? 'bg-blue-900/50 border-blue-600' :
                'bg-green-900/50 border-green-500 animate-pulse hover:bg-green-800/50'
              }`}
              style={{ transform: `translate(${t.pos.x}px, ${t.pos.y}px)` }}
            >
              {t.state === 'empty' && <span className="text-4xl opacity-30">🪑</span>}
              {t.state === 'waiting' && (
                <>
                  <div className="text-sm bg-yellow-500 text-black px-2 py-1 rounded font-bold absolute -top-4 shadow z-10">{MENU_EMOJIS[t.order!]}</div>
                  <div className="text-4xl opacity-50">🪑</div>
                </>
              )}
              {t.state === 'eating' && (
                <>
                  <div className="text-3xl mb-1">😋</div>
                  <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                     <div className="h-full bg-blue-500" style={{ width: `${(t.timer! / 5) * 100}%` }} />
                  </div>
                </>
              )}
              {t.state === 'cash_ready' && (
                <div className="flex flex-col items-center">
                  <span className="text-3xl">💵</span>
                  <span className="text-green-400 font-bold text-xs mt-1">+${MENU_PRICES[t.order!]}</span>
                </div>
              )}
            </div>
          ))}

          {/* Customers */}
          {s.customers.map(c => (
            <div
              key={`cust-${c.id}`}
              className="absolute w-10 h-10 -ml-5 -mt-5 flex items-center justify-center z-20"
              style={{ transform: `translate(${c.pos.x}px, ${c.pos.y}px)` }}
            >
              <div className={`${c.moving ? 'rg-walk' : ''}`} style={{ transform: c.facingLeft ? 'scaleX(-1)' : undefined }}>
                <div className="text-4xl relative">
                  🧍
                  {(c.phase === 'queue' || c.phase === 'walking_to_table') && (
                    <div className={`absolute -top-3 text-sm bg-white rounded-full p-0.5 shadow border border-gray-200 ${c.facingLeft ? '-left-3' : '-right-3'}`}>
                      {MENU_EMOJIS[c.order]}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Helpers */}
          {s.helpers.map(h => (
            <div
              key={`helper-${h.id}`}
              className="absolute w-12 h-12 -ml-6 -mt-6 flex flex-col items-center justify-center z-30"
              style={{ transform: `translate(${h.pos.x}px, ${h.pos.y}px)` }}
            >
              {h.tasks.length > 0 && <div className="absolute -top-4 text-[10px] text-zinc-400 bg-zinc-900/80 px-1 rounded whitespace-nowrap">{h.tasks.length} queued</div>}
              <div className={`${h.moving ? 'rg-walk' : ''}`} style={{ transform: h.facingLeft ? 'scaleX(-1)' : undefined }}>
                <div className="text-5xl drop-shadow-md relative">
                   🧑‍🍳
                   {h.inventory.length > 0 && (
                     <div className={`absolute top-0 flex flex-col-reverse gap-1 ${h.facingLeft ? '-left-4' : '-right-4'}`}>
                       {h.inventory.map((item, idx) => (
                         <span key={idx} className="bg-white rounded-full p-0.5 shadow text-xs">{MENU_EMOJIS[item]}</span>
                       ))}
                     </div>
                   )}
                </div>
              </div>
            </div>
          ))}

          {/* Owner */}
          <div
            className="absolute w-12 h-12 -ml-6 -mt-6 flex flex-col items-center justify-center z-30"
            style={{ transform: `translate(${s.owner.pos.x}px, ${s.owner.pos.y}px)` }}
          >
             {s.owner.tasks.length > 0 && <div className="absolute -top-4 text-[10px] text-zinc-400 bg-zinc-900/80 px-1 rounded whitespace-nowrap">{s.owner.tasks.length} queued</div>}
             <div className={`${s.owner.moving ? 'rg-walk' : ''}`} style={{ transform: s.owner.facingLeft ? 'scaleX(-1)' : undefined }}>
               <div className="text-5xl drop-shadow-lg filter hover:brightness-125 relative">
                 👨‍🍳
                 {s.owner.inventory.length > 0 && (
                   <div className={`absolute top-0 flex flex-col-reverse gap-1 ${s.owner.facingLeft ? '-left-4' : '-right-4'}`}>
                     {s.owner.inventory.map((item, idx) => (
                       <span key={idx} className="bg-white rounded-full p-0.5 shadow border border-gray-200 text-xs">{MENU_EMOJIS[item]}</span>
                     ))}
                   </div>
                 )}
               </div>
             </div>
          </div>

        </div>
      </div>
      </div>
      <style>{`
        @keyframes rg-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        .rg-walk { animation: rg-bob 0.35s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
