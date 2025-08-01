class EventManager {
    constructor() {
        this.events = [];
        this.filteredEvents = [];
        this.db = null;
        this.maxEvents = 250;
        this.initializeDB();
        this.initializeElements();
        this.setupEventListeners();
        this.setDefaultDate();
    }

    initializeElements() {
        this.eventName = document.querySelector("#eventName");
        this.eventDate = document.querySelector("#eventDate");
        this.searchInput = document.querySelector("#searchInput");
        this.buttonAdd = document.querySelector("#bAdd");
        this.eventsContainer = document.querySelector("#eventsContainer");
        this.eventCount = document.querySelector("#eventCount");
    }

    setDefaultDate() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        this.eventDate.value = tomorrow.toISOString().split('T')[0];
    }

    async initializeDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('EventManagerDB', 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                this.loadEvents();
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('events')) {
                    const store = db.createObjectStore('events', { keyPath: 'id' });
                    store.createIndex('name', 'name', { unique: false });
                    store.createIndex('date', 'date', { unique: false });
                }
            };
        });
    }

    setupEventListeners() {
        document.querySelector("form")?.addEventListener("submit", (e) => {
            e.preventDefault();
            this.addEvent();
        });

        this.buttonAdd?.addEventListener("click", (e) => {
            e.preventDefault();
            this.addEvent();
        });

        this.searchInput?.addEventListener("input", (e) => {
            this.filterEvents(e.target.value);
        });

        document.querySelector("#clearSearch")?.addEventListener("click", () => {
            this.searchInput.value = "";
            this.filterEvents("");
        });
    }

    async addEvent() {
        const name = this.eventName.value.trim();
        const date = this.eventDate.value;

        if (!name || !date) {
            this.showMessage("Por favor completa todos los campos", "error");
            return;
        }

        if (this.dateDiff(date) < 0) {
            this.showMessage("¿Acaso puedes volver al pasado?", "error");
            return;
        }

        if (this.events.length >= this.maxEvents) {
            this.showMessage(`Límite máximo de ${this.maxEvents} eventos alcanzado`, "error");
            return;
        }

        const newEvent = {
            id: this.generateId(),
            name: name,
            date: date,
            createdAt: new Date().toISOString()
        };

        try {
            await this.saveEventToDB(newEvent);
            this.events.unshift(newEvent);
            this.eventName.value = "";
            this.setDefaultDate(); // Reset to tomorrow
            this.filterEvents(this.searchInput?.value || "");
            this.showMessage("Evento agregado exitosamente", "success");
        } catch (error) {
            this.showMessage("Error al guardar el evento", "error");
            console.error("Error saving event:", error);
        }
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    dateDiff(dateString) {
        const targetDate = new Date(dateString);
        const today = new Date();

        // Reset time to avoid timezone bugs
        targetDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        const difference = targetDate.getTime() - today.getTime();
        return Math.ceil(difference / (1000 * 3600 * 24));
    }

    filterEvents(searchTerm) {
        if (!searchTerm) {
            this.filteredEvents = [...this.events];
        } else {
            const term = searchTerm.toLowerCase();
            this.filteredEvents = this.events.filter(event => 
                event.name.toLowerCase().includes(term) ||
                event.date.includes(term)
            );
        }
        this.renderEvents();
    }

    renderEvents() {
        if (!this.eventsContainer) return;

        if (this.eventCount) {
            const total = this.events.length;
            const showing = this.filteredEvents.length;
            this.eventCount.textContent = `${showing}/${total} eventos (máx: ${this.maxEvents})`;
        }

        if (this.filteredEvents.length === 0) {
            this.eventsContainer.innerHTML = `
                <div class="no-events">
                    <p>No hay eventos que mostrar</p>
                </div>
            `;
            return;
        }

        const sortedEvents = [...this.filteredEvents].sort((a, b) => 
            new Date(a.date) - new Date(b.date)
        );

        const eventsHTML = sortedEvents.map(event => {
            const daysDiff = this.dateDiff(event.date);
            const daysClass = daysDiff < 0 ? 'past' : daysDiff === 0 ? 'today' : 'future';
            return `
                <div class="event ${daysClass}" data-id="${event.id}">
                    <div class="days">
                        <span class="days-number">${Math.abs(daysDiff)}</span>
                        <span class="days-text">
                            ${daysDiff < 0 ? 'PASADO' : daysDiff === 0 ? 'HOY' : 'DÍAS'}
                        </span>
                    </div>
                    <div class="event-details">
                        <div class="event-name">${this.escapeHtml(event.name)}</div>
                        <div class="event-date">${this.formatDate(event.date)}</div>
                    </div>
                    <div class="actions">
                        <button class="bDelete" data-id="${event.id}" title="Eliminar evento">
                            Borrar
                        </button>
                    </div>
                </div>
            `;
        }).join("");

        this.eventsContainer.innerHTML = eventsHTML;
        
        this.attachDeleteListeners();
    }

    attachDeleteListeners() {
        this.eventsContainer.removeEventListener('click', this.handleDeleteClick);
        this.eventsContainer.addEventListener('click', this.handleDeleteClick.bind(this));
    }

    // Handle delete button clicks
    async handleDeleteClick(e) {
        if (e.target.classList.contains('bDelete')) {
            const id = e.target.getAttribute('data-id');
            if (confirm('¿Estás seguro de que quieres eliminar este evento?')) {
                await this.deleteEvent(id);
            }
        }
    }

    async deleteEvent(id) {
        try {
            await this.deleteEventFromDB(id);
            this.events = this.events.filter(event => event.id !== id);
            this.filterEvents(this.searchInput?.value || "");
            this.showMessage("Evento eliminado", "success");
        } catch (error) {
            this.showMessage("Error al eliminar el evento", "error");
            console.error("Error deleting event:", error);
        }
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-ES', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    // Escape HTML to prevent XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showMessage(message, type = 'info') {
        let messageContainer = document.querySelector('#messageContainer');
        if (!messageContainer) {
            messageContainer = document.createElement('div');
            messageContainer.id = 'messageContainer';
            messageContainer.className = 'message-container';
            document.body.appendChild(messageContainer);
        }

        const messageElement = document.createElement('div');
        messageElement.className = `message message-${type}`;
        messageElement.textContent = message;
        messageContainer.appendChild(messageElement);
        setTimeout(() => {
            messageElement.remove();
        }, 3000);
    }

    async saveEventToDB(event) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            const request = store.add(event);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async deleteEventFromDB(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async loadEvents() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readonly');
            const store = transaction.objectStore('events');
            const request = store.getAll();
            request.onsuccess = () => {
                this.events = request.result || [];
                this.events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                this.filterEvents("");
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new EventManager();
});
