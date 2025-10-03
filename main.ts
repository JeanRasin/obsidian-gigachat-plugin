import { App, Editor, Modal, Notice, Plugin, PluginSettingTab, Setting, TextAreaComponent } from 'obsidian';

/**
 * Настройки плагина Text Generator для GigaChat
 */
interface TextGeneratorSettings {
	apiKey: string;                    // API ключ от GigaChat
	apiUrl: string;                    // URL API endpoint для генерации текста
	authUrl: string;                   // URL для аутентификации OAuth
	clientId: string;                  // Client ID для OAuth аутентификации
	scope: string;                     // Scope доступа для OAuth
	model: string;                     // Модель GigaChat для использования
	temperature: number;               // Креативность ответов (0.0-1.0)
	maxTokens: number;                 // Максимальная длина ответа
	logMessages: boolean;              // Включить логирование
}

/**
 * Настройки по умолчанию
 */
const DEFAULT_SETTINGS: TextGeneratorSettings = {
	apiKey: '',
	apiUrl: 'https://gigachat.devices.sberbank.ru/api/v1',
	authUrl: 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
	clientId: '<base64>',
	scope: 'GIGACHAT_API_PERS',
	model: 'GigaChat',
	temperature: 0.7,
	maxTokens: 1000,
	logMessages: true
}

/**
 * Основной класс плагина Text Generator для GigaChat
 */
export default class TextGeneratorPlugin extends Plugin {
	settings: TextGeneratorSettings;

	// Исправлено: убрано private, теперь это публичное свойство
	logContainer: HTMLElement | null = null;

	/**
	 * Метод загрузки плагина - вызывается при включении плагина
	 */
	async onload() {
		// Загружаем настройки из хранилища
		await this.loadSettings();

		// Добавляем команду в командную палитру для генерации текста
		this.addCommand({
			id: 'generate-text',
			name: 'Сгенерировать текст с GigaChat',
			editorCallback: (editor: Editor) => {
				// Открываем модальное окно для ввода промпта
				new TextGenerationModal(this.app, editor, this.settings, this).open();
			}
		});

		// ⭐ НОВАЯ КОМАНДА: Генерация из выделенного текста
		this.addCommand({
			id: 'generate-from-selection',
			name: 'Генерация из выделенного текста',
			editorCallback: (editor: Editor) => {
				const selection = editor.getSelection();
				if (selection) {
					// Открываем модальное окно с предзаполненным выделенным текстом
					new TextGenerationModal(this.app, editor, this.settings, this, selection).open();
				} else {
					new Notice('❌ Сначала выделите текст для генерации');
				}
			}
		});

		// Добавляем вкладку настроек в настройки Obsidian
		this.addSettingTab(new TextGeneratorSettingTab(this.app, this));

		// Логируем успешную загрузку плагина
		this.logMessage('Плагин GigaChat Text Generator успешно загружен', 'success');

		// Можно добавить в onload() для стилизации
		this.registerStyles();
	}

	/**
 * Регистрация CSS стилей для улучшения внешнего вида
 */
	private registerStyles() {
		const style = document.createElement('style');
		style.textContent = `
        .gigachat-selection-info {
            border-left: 3px solid var(--interactive-accent);
        }
        .gigachat-quick-commands button {
            background: var(--background-secondary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 4px;
            cursor: pointer;
        }
        .gigachat-quick-commands button:hover {
            background: var(--background-modifier-hover);
        }
    `;
		document.head.appendChild(style);
	}

	/**
	 * Загрузка настроек из локального хранилища Obsidian
	 */
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	/**
	 * Сохранение настроек в локальное хранилище Obsidian
	 */
	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Логирование сообщений в консоль и UI
	 * @param message - Текст сообщения
	 * @param type - Тип сообщения: info, error, success
	 */
	logMessage(message: string, type: 'info' | 'error' | 'success' = 'info') {
		// Если логирование отключено в настройках - выходим
		if (!this.settings.logMessages) return;

		// Создаем временную метку для лога
		const timestamp = new Date().toLocaleTimeString();
		const logEntry = `[${timestamp}] ${message}`;

		// Логируем в консоль браузера
		console.log(`GigaChat Plugin ${type}:`, message);

		// Если контейнер для логов существует (открыта вкладка настроек), добавляем сообщение в UI
		if (this.logContainer) {
			const messageEl = this.logContainer.createDiv({
				cls: `gigachat-log-entry gigachat-log-${type}`
			});
			messageEl.setText(logEntry);

			// Автоматическая прокрутка к последнему сообщению
			this.logContainer.scrollTop = this.logContainer.scrollHeight;
		}
	}

	/**
	 * Тестирование подключения к GigaChat API
	 * @returns Promise<boolean> - true если подключение успешно, false если есть ошибки
	 */
	async testConnection(): Promise<boolean> {
		this.logMessage('Начинаем тестирование подключения к GigaChat...', 'info');

		// Проверяем наличие API ключа
		if (!this.settings.apiKey) {
			this.logMessage('❌ API ключ не установлен', 'error');
			return false;
		}

		try {
			// Шаг 1: Получение access token
			this.logMessage('Получение access token...', 'info');
			const accessToken = await this.getAccessToken();

			if (!accessToken) {
				this.logMessage('❌ Не удалось получить access token', 'error');
				return false;
			}

			this.logMessage('✅ Access token успешно получен', 'success');

			// Шаг 2: Тестирование отправки сообщения
			this.logMessage('Тестирование отправки сообщения...', 'info');
			const testResponse = await this.testApiRequest(accessToken);

			if (testResponse) {
				this.logMessage('✅ Подключение к GigaChat API успешно установлено!', 'success');
				return true;
			} else {
				this.logMessage('❌ Не удалось отправить тестовый запрос', 'error');
				return false;
			}

		} catch (error) {
			// Обработка ошибок при тестировании
			this.logMessage(`❌ Ошибка при тестировании: ${error.message}`, 'error');
			return false;
		}
	}

	/**
	 * Получение access token от GigaChat API
	 * @returns Promise<string> - access token
	 */
	async getAccessToken(): Promise<string> {
		try {
			this.logMessage('Отправка запроса для получения access token...', 'info');

			// Отправляем OAuth запрос для получения токена
			const authResponse = await fetch(this.settings.authUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Authorization': `Basic ${this.settings.clientId}`,
					'RqUID': this.generateUuid(), // Уникальный ID запроса
				},
				body: `scope=${this.settings.scope}` // Scope доступа из настроек
			});

			// Проверяем статус ответа
			if (!authResponse.ok) {
				throw new Error(`HTTP ${authResponse.status}: ${authResponse.statusText}`);
			}

			// Парсим JSON ответ
			const authData = await authResponse.json();
			this.logMessage(`Access token получен, срок действия: ${authData.expires_in} сек`, 'info');
			return authData.access_token;

		} catch (error) {
			// Логируем ошибку получения токена
			this.logMessage(`Ошибка получения access token: ${error.message}`, 'error');
			throw error;
		}
	}

	/**
	 * Тестовый запрос к GigaChat API для проверки работы
	 * @param accessToken - Access token для авторизации
	 * @returns Promise<boolean> - true если запрос успешен
	 */
	async testApiRequest(accessToken: string): Promise<boolean> {
		try {
			this.logMessage('Отправка тестового запроса к GigaChat API...', 'info');

			// Отправляем тестовый запрос с простым сообщением
			const response = await fetch(`${this.settings.apiUrl}/chat/completions`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${accessToken}`
				},
				body: JSON.stringify({
					model: this.settings.model,
					messages: [
						{
							role: 'user',
							content: 'Ответь одним словом: "работает"' // Простой тестовый промпт
						}
					],
					temperature: 0.1,  // Низкая температура для предсказуемого ответа
					max_tokens: 10     // Короткий ответ
				})
			});

			// Проверяем статус ответа
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			// Парсим и логируем ответ
			const data = await response.json();
			this.logMessage(`Тестовый ответ получен: ${JSON.stringify(data, null, 2)}`, 'info');
			return true;

		} catch (error) {
			// Логируем ошибку тестового запроса
			this.logMessage(`Ошибка тестового запроса: ${error.message}`, 'error');
			return false;
		}
	}

	/**
	 * Генерация UUID для идентификации запросов
	 * @returns string - UUID v4
	 */
	generateUuid(): string {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
			const r = Math.random() * 16 | 0;
			const v = c == 'x' ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});
	}
}

/**
 * Модальное окно для генерации текста
 */
class TextGenerationModal extends Modal {
	editor: Editor;                    // Текущий редактор Obsidian
	settings: TextGeneratorSettings;   // Настройки плагина
	plugin: TextGeneratorPlugin;       // Ссылка на основной класс плагина
	initialText: string; // ⭐ НОВОЕ: храним исходный текст

	constructor(app: App, editor: Editor, settings: TextGeneratorSettings, plugin: TextGeneratorPlugin, initialText?: string) {
		super(app);
		this.editor = editor;
		this.settings = settings;
		this.plugin = plugin;
		this.initialText = initialText || ''; // ⭐ НОВОЕ: принимаем исходный текст
	}

	/**
	 * Метод открытия модального окна
	 */
	onOpen() {
		const { contentEl } = this;

		contentEl.createEl('h2', { text: 'Генерация текста с GigaChat' });

		// ⭐ НОВОЕ: Информация о выделенном тексте
		if (this.initialText) {
			const selectionInfo = contentEl.createDiv({
				cls: 'gigachat-selection-info',
				attr: { style: 'background-color: var(--background-secondary); padding: 8px; border-radius: 4px; margin-bottom: 10px; font-size: 12px;' }
			});
			selectionInfo.setText(`📝 Выделенный текст (${this.initialText.length} символов): "${this.initialText.substring(0, 100)}${this.initialText.length > 100 ? '...' : ''}"`);
		}

		// Поле ввода промпта
		const promptInput = contentEl.createEl('textarea', {
			placeholder: this.initialText ? 'Введите команду для выделенного текста...' : 'Введите ваш запрос здесь...',
			attr: { style: 'width: 100%; height: 100px; margin-bottom: 10px;' }
		});

		// ⭐ НОВОЕ: Быстрые команды для выделенного текста
		if (this.initialText) {
			const quickCommands = contentEl.createDiv({
				cls: 'gigachat-quick-commands',
				attr: { style: 'margin-bottom: 10px;' }
			});

			quickCommands.createEl('div', {
				text: 'Быстрые команды:',
				attr: { style: 'font-size: 12px; color: var(--text-muted); margin-bottom: 5px;' }
			});

			const commandsContainer = quickCommands.createDiv({
				attr: { style: 'display: flex; gap: 5px; flex-wrap: wrap;' }
			});

			const quickCommandsList = [
				{ text: '📝 Улучшить', prompt: 'Улучши этот текст, сохраняя смысл:' },
				{ text: '📋 Перефразировать', prompt: 'Перефразируй этот текст другими словами:' },
				{ text: '🔍 Объяснить', prompt: 'Объясни этот текст простыми словами:' },
				{ text: '📊 Суммаризировать', prompt: 'Суммаризируй этот текст кратко:' }
			];

			quickCommandsList.forEach(command => {
				const btn = commandsContainer.createEl('button', {
					text: command.text,
					attr: { style: 'font-size: 11px; padding: 4px 8px;' }
				});
				btn.onclick = () => {
					promptInput.value = `${command.prompt}\n\n${this.initialText}`;
				};
			});
		}

		// ⭐⭐ ДОБАВЛЯЕМ: Элемент для отображения статуса
		const statusEl = contentEl.createDiv({
			cls: 'gigachat-status',
			attr: { style: 'margin: 10px 0; padding: 5px; border-radius: 3px;' }
		});

		// ⭐⭐ ДОБАВЛЯЕМ: Кнопки управления
		const buttonsContainer = contentEl.createDiv({
			attr: { style: 'display: flex; gap: 10px;' }
		});

		const generateButton = buttonsContainer.createEl('button', {
			text: 'Сгенерировать',
			attr: { style: 'flex: 1;' }
		});

		const cancelButton = buttonsContainer.createEl('button', {
			text: 'Отмена',
			attr: { style: 'flex: 1;' }
		});

		// ⭐⭐ ДОБАВЛЯЕМ: Обработчик нажатия кнопки Generate
		generateButton.onclick = async () => {
			// Проверяем наличие API ключа
			if (!this.settings.apiKey) {
				new Notice('Пожалуйста, установите ваш GigaChat API ключ в настройках');
				return;
			}

			// Проверяем наличие промпта
			const prompt = promptInput.value;
			if (!prompt) {
				new Notice('Пожалуйста, введите запрос');
				return;
			}

			// Блокируем кнопку и показываем статус
			generateButton.setText('Генерация...');
			generateButton.setAttr('disabled', 'true');
			statusEl.setText('Отправка запроса к GigaChat...');
			statusEl.setAttr('style', 'background-color: var(--background-modifier-hover); color: var(--text-normal);');

			try {
				// ⭐⭐ НОВАЯ ЛОГИКА: Выбираем метод генерации
				const accessToken = await this.plugin.getAccessToken();
				let generatedText: string;

				if (this.initialText) {
					// Генерация с контекстом (выделенным текстом)
					generatedText = await this.generateTextWithContext(prompt, this.initialText, accessToken);
				} else {
					// Обычная генерация без контекста
					generatedText = await this.generateText(prompt, accessToken);
				}

				// Вставляем сгенерированный текст в редактор
				this.editor.replaceRange(generatedText, this.editor.getCursor());
				this.close();

			} catch (error) {
				// Показываем ошибку в UI
				statusEl.setText(`Ошибка: ${error.message}`);
				statusEl.setAttr('style', 'background-color: var(--background-modifier-error); color: var(--text-on-accent);');
				this.plugin.logMessage(`Ошибка генерации: ${error.message}`, 'error');
			} finally {
				// Разблокируем кнопку независимо от результата
				generateButton.setText('Сгенерировать');
				generateButton.removeAttribute('disabled');
			}
		};

		// ⭐⭐ ДОБАВЛЯЕМ: Обработчик кнопки Cancel
		cancelButton.onclick = () => {
			this.close();
		};
	}

	/**
	 * Генерация текста через GigaChat API
	 * @param prompt - Текст запроса
	 * @param accessToken - Access token для авторизации
	 * @returns Promise<string> - Сгенерированный текст
	 */
	async generateText(prompt: string, accessToken: string): Promise<string> {
		// Логируем начало генерации
		this.plugin.logMessage(`Генерация текста для запроса: ${prompt.substring(0, 50)}...`, 'info');

		// Отправляем запрос к GigaChat API
		const response = await fetch(`${this.settings.apiUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${accessToken}`
			},
			body: JSON.stringify({
				model: this.settings.model,
				messages: [
					{
						role: 'user',
						content: prompt
					}
				],
				temperature: this.settings.temperature,
				max_tokens: this.settings.maxTokens
			})
		});

		// Проверяем статус ответа
		if (!response.ok) {
			throw new Error(`API error: ${response.status} ${response.statusText}`);
		}

		// Парсим ответ и извлекаем сгенерированный текст
		const data = await response.json();
		const generatedText = data.choices[0].message.content;

		// Логируем успешную генерацию
		this.plugin.logMessage(`Сгенерировано ${generatedText.length} символов`, 'success');
		return generatedText;
	}
	/**
 * Генерация текста на основе контекста (выделенного текста)
 * @param prompt - Команда/промпт пользователя
 * @param context - Выделенный текст как контекст
 * @param accessToken - Access token для авторизации
 * @returns Promise<string> - Сгенерированный текст
 */
	async generateTextWithContext(prompt: string, context: string, accessToken: string): Promise<string> {
		// Логируем начало генерации с контекстом
		this.plugin.logMessage(`Генерация с контекстом (${context.length} символов): ${prompt.substring(0, 50)}...`, 'info');

		// Формируем промпт с контекстом
		const fullPrompt = `${prompt}\n\nКонтекст:\n"${context}"`;

		const response = await fetch(`${this.settings.apiUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${accessToken}`
			},
			body: JSON.stringify({
				model: this.settings.model,
				messages: [
					{
						role: 'user',
						content: fullPrompt
					}
				],
				temperature: this.settings.temperature,
				max_tokens: this.settings.maxTokens
			})
		});

		if (!response.ok) {
			throw new Error(`API error: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		const generatedText = data.choices[0].message.content;

		this.plugin.logMessage(`Сгенерировано ${generatedText.length} символов с контекстом`, 'success');
		return generatedText;
	}
}

/**
 * Вкладка настроек плагина в настройках Obsidian
 */
class TextGeneratorSettingTab extends PluginSettingTab {
	plugin: TextGeneratorPlugin;
	private logContainer: HTMLElement;  // Контейнер для логов (приватный только для этого класса)

	constructor(app: App, plugin: TextGeneratorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Отображение вкладки настроек
	 */
	display(): void {
		const { containerEl } = this;

		// Очищаем контейнер перед построением UI
		containerEl.empty();

		// Заголовок вкладки настроек
		containerEl.createEl('h2', { text: 'Настройки GigaChat Text Generator' });

		// === НАСТРОЙКИ API ===

		// Настройка API ключа
		new Setting(containerEl)
			.setName('API ключ')
			.setDesc('Ваш GigaChat API ключ - получите на developers.sber.ru')
			.addText(text => text
				.setPlaceholder('Введите ваш API ключ')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));

		// Настройка URL API для генерации
		new Setting(containerEl)
			.setName('URL API')
			.setDesc('GigaChat API endpoint для генерации текста - обычно не требует изменений')
			.addText(text => text
				.setPlaceholder('https://gigachat.devices.sberbank.ru/api/v1')
				.setValue(this.plugin.settings.apiUrl)
				.onChange(async (value) => {
					this.plugin.settings.apiUrl = value;
					await this.plugin.saveSettings();
				}));

		// Настройка URL для аутентификации
		new Setting(containerEl)
			.setName('URL аутентификации')
			.setDesc('URL для OAuth аутентификации - обычно не требует изменений')
			.addText(text => text
				.setPlaceholder('https://ngw.devices.sberbank.ru:9443/api/v2/oauth')
				.setValue(this.plugin.settings.authUrl)
				.onChange(async (value) => {
					this.plugin.settings.authUrl = value;
					await this.plugin.saveSettings();
				}));

		// Настройка Client ID
		new Setting(containerEl)
			.setName('Client ID')
			.setDesc('Client ID для OAuth аутентификации - обычно не требует изменений')
			.addText(text => text
				.setPlaceholder('MDE5OTgwNzMtMTQ5NC03Njk0LTk3NDEtNjAxNWFkZTk2ZTY1OmI1NGZiMDI4LTBmZjAtNGMwMi04YjBhLTQwZDQ0NjY0NDJmOA==')
				.setValue(this.plugin.settings.clientId)
				.onChange(async (value) => {
					this.plugin.settings.clientId = value;
					await this.plugin.saveSettings();
				}));

		// Настройка Scope
		new Setting(containerEl)
			.setName('Scope доступа')
			.setDesc('Scope для OAuth аутентификации - обычно не требует изменений')
			.addText(text => text
				.setPlaceholder('GIGACHAT_API_PERS')
				.setValue(this.plugin.settings.scope)
				.onChange(async (value) => {
					this.plugin.settings.scope = value;
					await this.plugin.saveSettings();
				}));

		// === ТЕСТИРОВАНИЕ ПОДКЛЮЧЕНИЯ ===

		// Кнопка тестирования подключения
		new Setting(containerEl)
			.setName('Тестирование подключения')
			.setDesc('Проверка подключения к GigaChat API - проверяет аутентификацию и базовую функциональность')
			.addButton(button => button
				.setButtonText('Тестировать подключение')
				.setCta()  // Выделенная кнопка
				.onClick(async () => {
					// Блокируем кнопку во время тестирования
					button.setButtonText('Тестирование...');
					button.setDisabled(true);

					// Выполняем тестирование подключения
					const success = await this.plugin.testConnection();

					// Разблокируем кнопку после завершения
					button.setButtonText('Тестировать подключение');
					button.setDisabled(false);

					// Показываем уведомление с результатом
					if (success) {
						new Notice('✅ Тестирование подключения прошло успешно!');
					} else {
						new Notice('❌ Тестирование подключения не удалось! Проверьте логи для деталей.');
					}
				}));

		// === НАСТРОЙКИ ГЕНЕРАЦИИ ===

		// Настройка модели
		new Setting(containerEl)
			.setName('Модель')
			.setDesc('Модель GigaChat для генерации текста')
			.addText(text => text
				.setPlaceholder('GigaChat')
				.setValue(this.plugin.settings.model)
				.onChange(async (value) => {
					this.plugin.settings.model = value;
					await this.plugin.saveSettings();
				}));

		// Настройка температуры (креативности)
		new Setting(containerEl)
			.setName('Температура')
			.setDesc('Креативность ответов: низкие значения = более предсказуемо, высокие значения = более креативно')
			.addSlider(slider => slider
				.setLimits(0, 1, 0.1)  // Минимум, максимум, шаг
				.setValue(this.plugin.settings.temperature)
				.setDynamicTooltip()  // Показывать значение при перемещении
				.onChange(async (value) => {
					this.plugin.settings.temperature = value;
					await this.plugin.saveSettings();
				}));

		// Настройка максимальной длины ответа
		new Setting(containerEl)
			.setName('Максимальное количество токенов')
			.setDesc('Максимальная длина ответа в токенах (примерно 0.75 токенов на слово)')
			.addText(text => text
				.setPlaceholder('1000')
				.setValue(this.plugin.settings.maxTokens.toString())
				.onChange(async (value) => {
					this.plugin.settings.maxTokens = Number(value);
					await this.plugin.saveSettings();
				}));

		// === НАСТРОЙКИ ЛОГГИРОВАНИЯ ===

		// Включение/выключение логгирования
		new Setting(containerEl)
			.setName('Включить логирование')
			.setDesc('Показывать отладочные сообщения в логе ниже - полезно для диагностики проблем')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.logMessages)
				.onChange(async (value) => {
					this.plugin.settings.logMessages = value;
					await this.plugin.saveSettings();
				}));

		// === СЕКЦИЯ ЛОГОВ ===

		// Заголовок секции логов
		containerEl.createEl('h3', { text: 'Лог подключения' });

		// Описание секции логов
		const logDescription = containerEl.createDiv({
			cls: 'setting-item-description'
		});
		logDescription.setText('Сообщения лога будут появляться здесь. Полезно для отладки проблем подключения и понимания того, что происходит во время API вызовов.');

		// Контейнер для отображения логов
		this.logContainer = containerEl.createDiv({
			cls: 'gigachat-log-container',
			attr: {
				style: 'border: 1px solid var(--background-modifier-border); border-radius: 4px; padding: 10px; max-height: 200px; overflow-y: auto; font-family: monospace; font-size: 12px; background-color: var(--background-secondary);'
			}
		});

		// Сохраняем ссылку на контейнер логов в основном классе плагина
		this.plugin.logContainer = this.logContainer;

		// Кнопка очистки логов
		new Setting(containerEl)
			.setName('Очистить лог')
			.setDesc('Очистить все сообщения лога из отображения')
			.addButton(button => button
				.setButtonText('Очистить лог')
				.onClick(() => {
					// Очищаем контейнер логов
					this.logContainer.empty();
					// Добавляем сообщение о очистке
					this.plugin.logMessage('Лог очищен', 'info');
				}));
	}

	/**
	 * Метод скрытия вкладки настроек
	 */
	hide() {
		// Очищаем ссылку на контейнер логов при закрытии вкладки
		// чтобы избежать утечек памяти
		this.plugin.logContainer = null;
		super.hide();
	}
}

