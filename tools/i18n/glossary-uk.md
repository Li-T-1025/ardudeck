# Ukrainian glossary (ArduDeck desktop) / Глосарій української локалізації

Стиль: діловий і лаконічний; усталений пілотський жаргон (арм, дизарм) допустимий, інший розмовний жаргон ні. До користувача звертаємося на «ви» (з малої літери), але по змозі безособово. Кнопки та пункти меню в інфінітиві («Зберегти», «Підключити»), не в наказовому способі.
Українська в середньому на 15-25% довша за англійську: обираємо найкоротший правильний термін. Скорочуємо лише там, де скорочено в англійській.
Лапки «...» у звичайному тексті. Апостроф ’ (U+2019). Без довгого тире (—): кома, двокрапка або « - ». Три крапки пишемо тим самим символом, що й в англійському рядку (… або ...).
Плюральні форми: `_one` (1, 21, 31 точка), `_few` (2-4, 22-24 точки), `_many` (5-20, 25 точок), `_other` (дробові: 1,5 точки).

## Не перекладаємо
- **Arm / Disarm / ARMED / DISARMED / Force Arm / Arming / Pre-arm** як назви кнопок, статусів і перемикачів лишаються англійською (так у ArduPilot, PX4, MAVLink і в німецькій версії ArduDeck). У звичайному тексті вживаємо пілотські форми: «армити», «дизармити», «заармлений», «арм», «дизарм», «перевірки перед армом» (pre-arm checks), «примусовий арм» (force arm).
- **Failsafe**: назва механізму ArduPilot (параметри FS_*). У поясненнях можна додати «аварійний захист».
- Назви польотних режимів (Loiter, RTL, Stabilize, AltHold, PosHold, Auto, Guided, Acro, QLoiter, ANGLE, HORIZON ...), назви параметрів (ARMING_CHECK, SR0_*), повідомлень і команд MAVLink (HEARTBEAT, DO_SET_SERVO, MAV_CMD_*), STATUSTEXT.
- Назви брендів, продуктів, плат і протоколів (ArduPilot, PX4, iNav, Betaflight, ExpressLRS, EdgeTX, MAVLink, CRSF, SBUS, DroneCAN, Matek ...), SITL, HUD, OSD, PID, ESC, GPS, RC.
- Символи одиниць (m/s, km/h, V, A, mAh, Hz, °), розширення файлів, клавіатурні скорочення (Ctrl+Z).
- **Home**: назва точки в ArduPilot («точка Home», «Встановити Home»).
- Скорочення в показниках HUD (ALT, GS, AS ...), якщо немає усталеного українського.

## Терміни
| English | Українська |
|---|---|
| vehicle | апарат |
| aircraft / drone / UAV | літальний апарат / дрон / БпЛА |
| copter / plane / rover / boat / sub | коптер / літак / ровер / човен / підводний апарат |
| multirotor / helicopter / fixed wing / flying wing | мультиротор / гелікоптер / літак / літаюче крило |
| tricopter / quad / hexa / octocopter | трикоптер / квадрокоптер / гексакоптер / октокоптер |
| VTOL / QuadPlane | VTOL / QuadPlane |
| flight controller (FC) | польотний контролер (FC) |
| companion computer | бортовий комп’ютер |
| ground station / GCS | наземна станція |
| flight mode | польотний режим |
| waypoint | точка маршруту |
| mission | місія |
| survey | аерозйомка |
| geofence / fence | геозона |
| rally point | точка збору |
| takeoff / land / return | зліт / посадка / повернення |
| return to home | повернення на Home |
| loiter (дія, не режим) | барражування |
| parameter | параметр |
| write / read (params to/from FC) | записати / прочитати |
| upload / download | вивантажити / завантажити |
| firmware / flash (firmware) | прошивка (ПЗ) / прошити, прошивання (процес) |
| flash (memory) | флеш-пам’ять |
| calibration / calibrate | калібрування / калібрувати |
| accelerometer / gyro / compass / barometer | акселерометр / гіроскоп / компас / барометр |
| level (calibration) | горизонт |
| roll / pitch / yaw / throttle | крен / тангаж / рискання / газ |
| stick | стік |
| expo / rates | Expo / Rates |
| tuning | налаштування PID |
| receiver / transmitter / radio | приймач / передавач / пульт |
| channel | канал |
| reverse (channel) | інвертувати; інверсія |
| telemetry | телеметрія |
| link | канал зв’язку |
| connection | підключення |
| connect / disconnect | підключити / відключити |
| serial port | послідовний порт |
| baud rate | швидкість (бод) |
| motor test | тест моторів |
| servo output | вихід сервоприводу |
| battery / cell | акумулятор / елемент |
| current / voltage | струм / напруга |
| altitude / height | висота |
| airspeed / ground speed | повітряна швидкість / шляхова швидкість |
| vertical speed / climb | вертикальна швидкість / набір висоти |
| heading | курс |
| attitude | просторове положення |
| rangefinder | далекомір |
| terrain | рельєф |
| log / logs | журнал / журнали |
| settings / configuration | налаштування / конфігурація |
| layout / panel | макет / панель |
| camera / gimbal | камера / підвіс |
| overlay | шар |
| cargo (extensions) / The Hangar | розширення / Ангар |
| offline map cache | офлайн-кеш карт |
| Save / Cancel / Apply / Close / Delete / Reset | Зберегти / Скасувати / Застосувати / Закрити / Видалити / Скинути |
| Loading... | Завантаження... |
| Unknown | Невідомо |
