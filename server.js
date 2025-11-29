// server.js (VERSIÓN FINAL DEFINITIVA)
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { Partida } = require('./logica'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const partida = new Partida(); 

let jugadoresConectados = {}; // socket.id -> hueco (0-3)
let partidaEnCurso = false;

app.use(express.static('public'));

io.on('connection', (socket) => {
    
    // --- LÓGICA DE LOBBY ---
    socket.emit('estado_lobby', {
        jugadores: Object.values(jugadoresConectados).length,
        nombres: partida.jugadores.map(j => j.nombre)
    });

    socket.on('entrar_juego', (datos) => {
        if (partidaEnCurso) {
            socket.emit('error_sala', 'La partida ya empezó.');
            return;
        }

        let hueco = -1;
        for(let i=0; i<4; i++) {
            if (!Object.values(jugadoresConectados).includes(i)) {
                hueco = i; break;
            }
        }

        if (hueco === -1) {
            socket.emit('error_sala', 'Mesa llena.');
            return;
        }

        jugadoresConectados[socket.id] = hueco;
        partida.jugadores[hueco].nombre = datos.nombre;
        
        io.emit('actualizar_lobby', {
            jugadores: Object.values(jugadoresConectados).length,
            nombres: partida.jugadores.map(j => j.nombre)
        });

        socket.emit('bienvenido', { id: hueco, nombre: datos.nombre });

        if (Object.values(jugadoresConectados).length === 4) {
            io.emit('aviso_inicio', "¡Mesa llena! Empezamos en 3 segundos...");
            setTimeout(() => iniciarSecuenciaPartida(), 3000);
        }
    });

    // --- JUGAR CARTA (FUSIONADO: ANIMACIONES + RONDAS) ---
    socket.on('jugar_carta', (datos) => {
        const id = jugadoresConectados[socket.id];
        if (id === undefined) return;
        
        // 1. REALIZAR JUGADA Y CAPTURAR RESULTADO (Importante para animaciones)
        const resultado = partida.realizarJugada(id, datos.indiceMano, datos.indicesMesa);

        // 2. SI HUBO EVENTO (BAC, LIMPIA...), ENVIAR ANIMACIÓN
        if (resultado && resultado.evento) {
            io.emit('efecto_visual', resultado.evento);
        }

        // 3. VERIFICAR SI SE ACABARON LAS MANOS (Tu lógica de tiempos)
        const todosSinCartas = partida.jugadores.every(j => j.mano.length === 0);

        if (todosSinCartas) {
            console.log("Sub-ronda finalizada. Repartiendo nuevas...");
            
            // Pausa visual antes de repartir
            setTimeout(() => {
                const reporte = partida.iniciarMano(false); // false = continuación
                
                if (reporte.finDeMazo) {
                    // Fin del mazo (40 cartas)
                    io.emit('aviso_central', reporte.mensaje);
                    // Reiniciar partida completa tras 5 segundos
                    setTimeout(() => iniciarSecuenciaPartida(), 5000);
                } else {
                    // Ronda normal (quedan cartas en el mazo)
                    if (reporte.mensajeRonda) io.emit('aviso_central', reporte.mensajeRonda);
                    
                    // Ocultar aviso tras 2s
                    setTimeout(() => io.emit('ocultar_aviso'), 2000);
                    
                    enviarManosPrivadas();
                    enviarEstadoATodos();
                }
            }, 1000);
        } else {
            // Sigue el juego normal
            enviarEstadoATodos();
        }
    });

    // --- ROBAR FALLO ---
    socket.on('robar_fallo', (datos) => {
        const id = jugadoresConectados[socket.id];
        if (id === undefined) return;
        partida.robarFallo(id, datos.indicesMesa);
        enviarEstadoATodos();
    });

    // --- DESCONEXIÓN ---
    socket.on('disconnect', () => {
        const hueco = jugadoresConectados[socket.id];
        if (hueco !== undefined) {
            delete jugadoresConectados[socket.id];
            partida.jugadores[hueco].nombre = `Esperando...`;
            partidaEnCurso = false;
            io.emit('actualizar_lobby', { jugadores: Object.values(jugadoresConectados).length, nombres: partida.jugadores.map(j => j.nombre) });
        }
    });
});

// --- FUNCIONES AUXILIARES ---

function iniciarSecuenciaPartida() {
    partidaEnCurso = true;
    io.emit('inicio_juego');

    const reporte = partida.iniciarMano(true); // true = Nuevo Mazo
    enviarManosPrivadas();

    // Animación inicial de la mesa
    const mesaVisual = reporte.cartasMesaInicial;
    io.emit('animar_reparto', { cartas: mesaVisual });

    setTimeout(() => {
        io.emit('aviso_central', reporte.mensajeMeada);

        setTimeout(() => {
            if (reporte.huboMeada) {
                // Si hubo meada, actualizamos visualmente las cartas corregidas
                partida.mesa = reporte.cartasMesaCorregida; 
                io.emit('animar_reparto', { cartas: reporte.cartasMesaCorregida });
            }
            
            io.emit('ocultar_aviso');
            enviarEstadoATodos();

        }, 3000);
    }, 4000);
}

function enviarManosPrivadas() {
    const sockets = io.sockets.sockets;
    for (const [socketId, socket] of sockets) {
        const id = jugadoresConectados[socketId];
        if (id === undefined) continue;
        socket.emit('tu_mano', partida.jugadores[id].mano);
    }
}

function enviarEstadoATodos() {
    const sockets = io.sockets.sockets;
    const p = partida.jugadores;

    // Calcular cartas
    const conteoCartas = partida.jugadores.map(j => j.pila.length);
    const totalCartasE1 = p[0].pila.length + p[2].pila.length;
    const totalCartasE2 = p[1].pila.length + p[3].pila.length;

    // Puntuaciones seguras (objeto nuevo + valor antiguo por seguridad)
    // Usamos ?. por si acaso el método no existiera en una versión vieja de logica
    const estadoE1 = partida.obtenerEstadoPuntos ? partida.obtenerEstadoPuntos(partida.macarronesEquipo1) : {p:0, fase:'Inicio'};
    const estadoE2 = partida.obtenerEstadoPuntos ? partida.obtenerEstadoPuntos(partida.macarronesEquipo2) : {p:0, fase:'Inicio'};

    // Aviso victoria
    if (partida.ganador) {
        io.emit('aviso_central', `🏆 ¡HA GANADO EL ${partida.ganador}! 🏆`);
    }

    const datosPublicos = {
        mesa: partida.mesa,
        turno: partida.turnoActual,
        
        // Datos dobles para evitar undefined en cliente
        macarronesE1: partida.macarronesEquipo1,
        puntuacionE1: estadoE1,
        
        macarronesE2: partida.macarronesEquipo2,
        puntuacionE2: estadoE2,

        nombres: partida.jugadores.map(j => j.nombre),
        nombreEquipo1: `Equipo 1 (${p[0].nombre} & ${p[2].nombre})`,
        nombreEquipo2: `Equipo 2 (${p[1].nombre} & ${p[3].nombre})`,
        totalCartasE1: totalCartasE1,
        totalCartasE2: totalCartasE2,
        cartasGanadas: conteoCartas
    };

    for (const [socketId, socket] of sockets) {
        const idJugador = jugadoresConectados[socketId];
        if (idJugador === undefined) continue;
        
        socket.emit('actualizar_tablero', {
            publico: datosPublicos,
            miMano: partida.jugadores[idJugador].mano,
            miId: idJugador
        });
    }
}

server.listen(3000, '0.0.0.0', () => console.log('Servidor listo en puerto 3000'));