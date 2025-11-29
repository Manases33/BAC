// logica.js
class Carta {
    constructor(palo, numero) { this.palo = palo; this.numero = numero; }
    // Importante: toString simple para comparar objetos
    id() { return `${this.numero}-${this.palo}`; }
}

class Baraja {
    constructor() { this.cartas = []; this.resetear(); }
    resetear() {
        this.cartas = [];
        const palos = ['Oros', 'Copas', 'Espadas', 'Bastos'];
        // En Bac: 1,2,3,4,5,6,7, 10(Sota), 11(Caballo), 12(Rey)
        const numeros = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]; 
        for (let palo of palos) for (let num of numeros) this.cartas.push(new Carta(palo, num));
    }
    barajar() {
        for (let i = this.cartas.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cartas[i], this.cartas[j]] = [this.cartas[j], this.cartas[i]];
        }
    }
    repartir(cantidad) { return this.cartas.splice(0, cantidad); }
}

class Jugador {
    constructor(id, nombre, equipo) {
        this.id = id;
        this.nombre = nombre;
        this.equipo = equipo; 
        this.mano = []; 
        this.pila = []; 
    }
}

class Partida {
    constructor() {
        this.baraja = new Baraja();
        this.mesa = [];
        this.jugadores = [];
        
        // PUNTUACIÓN
        this.macarronesEquipo1 = 0;
        this.macarronesEquipo2 = 0;
        
        // CONTROL
        this.repartidorActual = 0; 
        this.turnoActual = 0;

        // MEMORIA PARA BAC/REBAC
        this.memoria = {
            ultimaCartaTirada: null, // La carta física
            ultimoJugadorTiro: null, // ID del que la tiró
            tipoJugadaAnterior: null, // "tirar", "recoger"
            rachaBac: 0, // 0=nada, 1=Bac, 2=Rebac, 3=SanVicent
            ultimoJugadorQueRecogio: null
        };
        
        this.inicializarJugadores();
    }

    inicializarJugadores() {
        // IDs 0 y 2 son Equipo 1. IDs 1 y 3 son Equipo 2.
        this.jugadores.push(new Jugador(0, "Tú", 1));
        this.jugadores.push(new Jugador(1, "Rival 1", 2));
        this.jugadores.push(new Jugador(2, "Compañero", 1));
        this.jugadores.push(new Jugador(3, "Rival 2", 2));
    }

    iniciarMano(esNuevoMazo = false) {
        const reporte = {
            esNuevoMazo: esNuevoMazo,
            cartasMesaInicial: [],
            huboMeada: false,
            cartasMesaCorregida: [],
            mensajeMeada: "",
            finDeMazo: false,
            mensajeRonda: ""
        };

        if (esNuevoMazo) {
            console.log(`\n--- 🃏 NUEVO MAZO 🃏 ---`);
            this.baraja.resetear();
            this.baraja.barajar();
            this.mesa = [];
            this.jugadores.forEach(j => j.pila = []);
            
            // Turno rotativo
            this.turnoActual = (this.repartidorActual + 1) % 4; 
            this.memoria.ultimoJugadorQueRecogio = this.jugadores[this.repartidorActual]; 
            
            // 1. Repartimos la primera versión de la mesa
            this.mesa = this.baraja.repartir(4);
            reporte.cartasMesaInicial = [...this.mesa]; // Copia exacta para enviar al cliente

            // 2. Lógica de MEADA (Corregida: solo 1 punto)
            const equipoRepartidor = this.jugadores[this.repartidorActual].equipo;
            
            if (this.hayRepetidasEnMesa()) {
                reporte.huboMeada = true;
                reporte.mensajeMeada = "💧 ¡MEADA! (+1 Macarrón al Rival)";
                
                // Sumamos 1 punto al equipo contrario del que reparte
                const equipoRival = (equipoRepartidor === 1) ? 2 : 1;
                this.sumarMacarron(equipoRival, 1); 

                // Corregimos hasta que no haya repetidas
                while (this.hayRepetidasEnMesa()) {
                    this.corregirMesa();
                }
            } else {
                 reporte.mensajeMeada = "👍 LIMPIO. Punto para el que reparte.";
                 this.sumarMacarron(equipoRepartidor, 1);
            }
            // Guardamos la mesa final limpia
            reporte.cartasMesaCorregida = [...this.mesa];
        }

        // Resto del código de repartir manos...
        if (this.baraja.cartas.length === 0) return this.finalizarMazo();

        for (let jugador of this.jugadores) {
            jugador.mano = this.baraja.repartir(3);
            // Lógica simple de ronda (opcional)
            const counts = {};
            jugador.mano.forEach(c => counts[c.numero] = (counts[c.numero] || 0) + 1);
            if (Object.values(counts).some(v => v >= 2)) {
                reporte.mensajeRonda += ` ¡${jugador.nombre} canta RONDA! (+1 狛) `;
                this.sumarMacarron(jugador.equipo, 1);
            }
        }
        
        return reporte; 
    }

    realizarJugada(idJugador, indiceMano, indicesMesa) {
        if (idJugador !== this.turnoActual) return { evento: null };
        
        const jugador = this.jugadores[idJugador];
        const cartaJugada = jugador.mano[indiceMano];
        
        // Variable para guardar si pasa algo emocionante
        let eventoOcurrido = null;

        // Validación
        const analisis = this.analizarJugada(cartaJugada, indicesMesa);
        if (!analisis.esValida) return { evento: null };

        // 1. JUGADOR TIRA CARTA (No recoge)
        if (indicesMesa.length === 0) {
            jugador.mano.splice(indiceMano, 1);
            this.mesa.push(cartaJugada);

            this.memoria.ultimaCartaTirada = cartaJugada;
            this.memoria.tipoJugadaAnterior = "tirar";
            this.memoria.rachaBac = 0; 
        } 
        // 2. JUGADOR RECOGE
        else {
            jugador.mano.splice(indiceMano, 1); 
            
            const cartasLlevadas = [cartaJugada];
            indicesMesa.sort((a, b) => b - a);
            indicesMesa.forEach(idx => {
                cartasLlevadas.push(this.mesa[idx]);
                this.mesa.splice(idx, 1);
            });

            jugador.pila.push(...cartasLlevadas);
            this.memoria.ultimoJugadorQueRecogio = jugador;

            // --- Lógica BAC/REBAC ---
            let huboBac = false;
            // Solo hay bac si el anterior "tiró" y coinciden números
            if (this.memoria.tipoJugadaAnterior === "tirar" && this.memoria.ultimaCartaTirada) {
                const cartaRival = cartasLlevadas.find(c => c.numero === this.memoria.ultimaCartaTirada.numero);
                
                if (cartaRival && cartaJugada.numero === cartaRival.numero) {
                    this.memoria.rachaBac++;
                    huboBac = true;
                    
                    let puntos = (this.memoria.rachaBac >= 3) ? 3 : this.memoria.rachaBac;
                    this.sumarMacarron(jugador.equipo, puntos);
                    
                    // Definimos el texto del evento
                    if (this.memoria.rachaBac === 1) eventoOcurrido = "BAC";
                    else if (this.memoria.rachaBac === 2) eventoOcurrido = "REBAC";
                    else eventoOcurrido = "SAN VICENT";
                    
                    console.log("LOGICA: Evento detectado ->", eventoOcurrido); // Para depurar
                }
            }
            if (!huboBac) this.memoria.rachaBac = 0;

            // --- Lógica LIMPIA ---
            if (this.mesa.length === 0) {
                this.sumarMacarron(jugador.equipo, 1);
                if (eventoOcurrido) eventoOcurrido += " Y LIMPIA";
                else eventoOcurrido = "LIMPIA";
                
                console.log("LOGICA: Evento detectado ->", eventoOcurrido);
            }
            
            // Memoria para fallo escalera
            let maxValor = 0;
            cartasLlevadas.forEach(c => {
                const v = this.getValor(c);
                if (v > maxValor) maxValor = v;
            });
            this.memoria.valorMasAltoRecogido = maxValor;

            this.memoria.tipoJugadaAnterior = "recoger";
            this.memoria.ultimaCartaTirada = null; 
        }

        this.turnoActual = (this.turnoActual + 1) % 4;
        
        // ¡ESTO ES LO IMPORTANTE! Devolver el evento
        return { evento: eventoOcurrido };
    }

    // Valida si lo que intenta recoger es legal (Mismo número + Escalera)
    analizarJugada(cartaMano, indicesMesa) {
        // Si no selecciona cartas de la mesa, es tirar carta: SIEMPRE VÁLIDO
        if (indicesMesa.length === 0) return { esValida: true };

        // Obtenemos los objetos carta de la mesa
        const cartasMesa = indicesMesa.map(i => this.mesa[i]);
        
        // Ordenamos las cartas seleccionadas de menor a mayor valor para comprobar escalera
        cartasMesa.sort((a,b) => this.getValor(a) - this.getValor(b));

        // REGLA 1: La carta más baja de la mesa DEBE coincidir con tu carta
        if (cartasMesa[0].numero !== cartaMano.numero) {
            return { esValida: false }; // <--- Si seleccionas un 4 y un 7, y tienes un 5 -> ERROR
        }

        // REGLA 2: Si seleccionas más cartas, deben ser consecutivas (Escalera)
        // Ejemplo: Tienes 3. Mesa: 3, 4, 5. Seleccionas las 3.
        // cartaMesa[0] es 3 (== tu mano). cartaMesa[1] debe ser 4. cartaMesa[2] debe ser 5.
        for (let i = 0; i < cartasMesa.length - 1; i++) {
            const actual = this.getValor(cartasMesa[i]);
            const siguiente = this.getValor(cartasMesa[i+1]);
            
            // Si el salto no es de 1, la escalera está rota
            if (siguiente !== actual + 1) return { esValida: false };
        }
        
        return { esValida: true };
    }
    // Auxiliar para convertir valores (7->7, 10->8 para la lógica de +1, o usar lógica interna)
    // En tu regla: 1,2,3,4,5,6,7, 10, 11, 12.
    // La escalera salta del 7 al 10.
    getValor(carta) {
        if (carta.numero === 10) return 8; // Sota sigue al 7
        if (carta.numero === 11) return 9;
        if (carta.numero === 12) return 10;
        return carta.numero;
    }

    sumarMacarron(equipo, cantidad) {
        if (equipo === 1) this.macarronesEquipo1 += cantidad;
        else this.macarronesEquipo2 += cantidad;
    }

    hayRepetidasEnMesa() { 
        const nums = this.mesa.map(c => c.numero);
        return new Set(nums).size !== nums.length;
    }

    corregirMesa() {
        // Devolvemos las cartas al mazo, limpiamos array mesa, barajamos y sacamos 4 nuevas
        this.baraja.cartas.push(...this.mesa);
        this.mesa = []; 
        this.baraja.barajar();
        this.mesa = this.baraja.repartir(4);
    }
    
    // Función llamada cuando alguien pulsa "Robar Fallo"
    robarFallo(idJugador, indicesMesa) {
        if (indicesMesa.length === 0) return;

        const jugador = this.jugadores[idJugador];
        
        // Obtenemos las cartas seleccionadas de la mesa
        const cartasSeleccionadas = indicesMesa.map(i => this.mesa[i]);
        
        // CASO 1: FALLO DE PAREJA (Dos cartas iguales en la mesa)
        // Solo válido si seleccionas exactamente 2 cartas y son del mismo número
        if (cartasSeleccionadas.length === 2) {
            if (cartasSeleccionadas[0].numero === cartasSeleccionadas[1].numero) {
                console.log(`${jugador.nombre} roba fallo de PAREJA (${cartasSeleccionadas[0].numero})`);
                this.ejecutarRobo(jugador, indicesMesa);
                return;
            }
        }

        // CASO 2: FALLO DE ESCALERA (Se dejaron la continuación)
        // Solo válido si el anterior recogió cartas
        if (this.memoria.tipoJugadaAnterior === "recoger" && this.memoria.valorMasAltoRecogido > 0) {
            
            // Ordenamos lo que quieres robar de menor a mayor valor (ej: 5, 6, 7)
            cartasSeleccionadas.sort((a,b) => this.getValor(a) - this.getValor(b));

            // La primera carta que robas DEBE ser la siguiente a la más alta que recogió el anterior
            // Ejemplo: Se llevó hasta el 4. La primera carta que robas debe ser un 5.
            const valorEsperado = this.memoria.valorMasAltoRecogido + 1;
            
            if (this.getValor(cartasSeleccionadas[0]) === valorEsperado) {
                // Verificamos que si robas varias, sean consecutivas entre ellas (5, 6...)
                let esEscaleraValida = true;
                for (let i = 0; i < cartasSeleccionadas.length - 1; i++) {
                    if (this.getValor(cartasSeleccionadas[i+1]) !== this.getValor(cartasSeleccionadas[i]) + 1) {
                        esEscaleraValida = false;
                        break;
                    }
                }

                if (esEscaleraValida) {
                    console.log(`${jugador.nombre} roba fallo de ESCALERA`);
                    this.ejecutarRobo(jugador, indicesMesa);
                    return;
                }
            }
        }

        console.log("Intento de robo fallido: No cumple condiciones.");
        // Aquí no hacemos nada, el robo es ignorado porque no es legal
    }

    ejecutarRobo(jugador, indicesMesa) {
        const cartasRobadas = [];
        // Orden descendente para borrar sin romper índices
        indicesMesa.sort((a, b) => b - a);
        indicesMesa.forEach(idx => {
            cartasRobadas.push(this.mesa[idx]);
            this.mesa.splice(idx, 1);
        });
        jugador.pila.push(...cartasRobadas);
        
        // Si robando el fallo dejas la mesa vacía, ¿es Limpia? 
        // Normalmente el fallo no da limpia, pero si en tus reglas sí, descomenta esto:
        if (this.mesa.length === 0) this.sumarMacarron(jugador.equipo, 1);
    }

    finalizarMazo() {
        // ... (Tu código existente de finalizarMazo estaba bien, úsalo aquí) ...
        // Asegúrate de sumar cartas y macarrones como tenías.
        
        // SOBRAS
        if (this.mesa.length > 0 && this.memoria.ultimoJugadorQueRecogio) {
            this.memoria.ultimoJugadorQueRecogio.pila.push(...this.mesa);
        }
        this.mesa = [];

        // CONTAR
        let c1 = this.jugadores[0].pila.length + this.jugadores[2].pila.length;
        let c2 = this.jugadores[1].pila.length + this.jugadores[3].pila.length;
        
        if (c1 > 20) this.sumarMacarron(1, c1 - 20);
        if (c2 > 20) this.sumarMacarron(2, c2 - 20);

        // ROTAR REPARTIDOR
        this.repartidorActual = (this.repartidorActual + 1) % 4;

        return { finDeMazo: true, mensaje: `Fin del Mazo. Cartas: E1(${c1}) - E2(${c2})` };
    }

    sumarMacarron(equipo, cantidad) {
        if (equipo === 1) this.macarronesEquipo1 += cantidad;
        else this.macarronesEquipo2 += cantidad;
        
        // Comprobar victoria inmediata (24 puntos = 12 malas + 12 buenas)
        this.checkVictoria();
    }

    checkVictoria() {
        if (this.macarronesEquipo1 >= 24) {
            this.ganador = "EQUIPO 1";
            console.log("¡VICTORIA EQUIPO 1!");
        } else if (this.macarronesEquipo2 >= 24) {
            this.ganador = "EQUIPO 2";
            console.log("¡VICTORIA EQUIPO 2!");
        }
    }

    // --- NUEVO MÉTODO AUXILIAR PARA EL FORMATO VISUAL ---
    obtenerEstadoPuntos(puntosTotales) {
        // Si ya ha ganado (24 o más)
        if (puntosTotales >= 24) return { p: 12, fase: "GANADOR", esVictoria: true };
        
        // FASE MALAS (0 a 11)
        if (puntosTotales < 12) {
            return { p: puntosTotales, fase: "Malas", esVictoria: false };
        } 
        // FASE BUENAS (12 a 23)
        else {
            // AQUÍ ESTÁ EL TRUCO: Restamos 12
            // Si tienes 13 puntos reales -> Muestra 1
            // Si tienes 20 puntos reales -> Muestra 8
            return { p: puntosTotales - 12, fase: "Buenas", esVictoria: false };
        }
    }
}

module.exports = { Partida };