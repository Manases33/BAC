// public/client.js
const socket = io();

// ESTADO DEL JUEGO
let miId = null;
let miMano = [];
let mesa = [];
let indicesMesaSeleccionados = [];
let indiceCartaManoSeleccionada = null;

// CONFIGURACIÓN VISUAL
const ICONOS = { 'Oros': '●', 'Copas': '🏆', 'Espadas': '⚔️', 'Bastos': '🌲' };
const CLASES_PALO = { 'Oros': 'oros', 'Copas': 'copas', 'Espadas': 'espadas', 'Bastos': 'bastos' };

// --- 1. FUNCIONES DE LOGIN Y LOBBY ---

// Esta es la función que llama el botón "UNIRSE"
function unirsePartida() {
    const nombre = document.getElementById('input-nombre').value;
    if (nombre) {
        socket.emit('entrar_juego', { nombre: nombre });
    } else {
        alert("¡Escribe un nombre para jugar!");
    }
}

socket.on('error_sala', (msg) => {
    alert(msg);
});

socket.on('bienvenido', (datos) => {
    miId = datos.id;
    console.log("Soy el Jugador ID:", miId);
});

socket.on('actualizar_lobby', (datos) => {
    const lista = document.getElementById('lista-jugadores-ul');
    if(lista) {
        lista.innerHTML = datos.nombres.map(n => `<li>${n}</li>`).join('');
        document.getElementById('info-espera').innerText = `Jugadores: ${datos.jugadores}/4`;
    }
});

socket.on('aviso_inicio', (msg) => {
    const info = document.getElementById('info-espera');
    if(info) {
        info.innerText = msg;
        info.style.color = "#ffd700";
        info.style.fontSize = "20px";
        info.style.fontWeight = "bold";
    }
});

socket.on('inicio_juego', () => {
    // Cambiamos de pantalla
    document.getElementById('pantalla-login').classList.add('oculto');
    document.getElementById('pantalla-juego').classList.remove('oculto');
});


// --- 2. BUCLE DEL JUEGO (EVENTOS) ---

socket.on('tu_mano', (mano) => {
    miMano = mano;
    renderizarMiMano();
});

socket.on('animar_reparto', (datos) => {
    mesa = datos.cartas;
    animarRepartoMesa(); // Inicia la animación de cartas cayendo
});

socket.on('aviso_central', (msg) => {
    const aviso = document.getElementById('aviso-central');
    aviso.innerText = msg;
    aviso.classList.remove('oculto');
});

socket.on('ocultar_aviso', () => {
    document.getElementById('aviso-central').classList.add('oculto');
});

socket.on('actualizar_tablero', (estado) => {
    const { publico, miMano: manoServidor } = estado;
    miMano = manoServidor;
    mesa = publico.mesa;

    // --- ACTUALIZAR MARCADOR (LÓGICA SEGURA) ---
    // Si puntuacionE1 existe (objeto nuevo), lo usamos. Si no, usamos el backup.
    const p1 = publico.puntuacionE1 || { p: publico.macarronesE1 || 0, fase: 'Inicio' };
    const p2 = publico.puntuacionE2 || { p: publico.macarronesE2 || 0, fase: 'Inicio' };

    // EQUIPO 1
    document.getElementById('n-e1').innerText = publico.nombreEquipo1;
    document.getElementById('mac-e1').innerHTML = `${p1.p} <span style="font-size:14px">(${p1.fase})</span>`;
    document.getElementById('mac-e1').style.color = (p1.fase === "Buenas") ? "#ff5252" : "white";
    document.getElementById('cart-e1').innerText = publico.totalCartasE1;

    // EQUIPO 2
    document.getElementById('n-e2').innerText = publico.nombreEquipo2;
    document.getElementById('mac-e2').innerHTML = `${p2.p} <span style="font-size:14px">(${p2.fase})</span>`;
    document.getElementById('mac-e2').style.color = (p2.fase === "Buenas") ? "#ff5252" : "white";
    document.getElementById('cart-e2').innerText = publico.totalCartasE2;
    // -------------------------------------------

    // ACTUALIZAR MARCADOR
    document.getElementById('n-e1').innerText = publico.nombreEquipo1;
    document.getElementById('mac-e1').innerText = publico.macarronesE1;
    document.getElementById('cart-e1').innerText = publico.totalCartasE1;

    document.getElementById('n-e2').innerText = publico.nombreEquipo2;
    document.getElementById('mac-e2').innerText = publico.macarronesE2;
    document.getElementById('cart-e2').innerText = publico.totalCartasE2;

    // BOTONES Y TURNO
    const esMiTurno = (publico.turno === miId);
    document.getElementById('btn-jugar').disabled = !esMiTurno;
    document.getElementById('btn-fallo').disabled = !esMiTurno;

    // RENDERIZADO
    renderizarMesa();
    renderizarMiMano();
    actualizarRivales(publico.nombres, publico.turno, publico.cartasGanadas);

    indicesMesaSeleccionados = [];
    indiceCartaManoSeleccionada = null;
});


// --- 3. FUNCIONES VISUALES ---

function animarRepartoMesa() {
    const zona = document.getElementById('zona-mesa');
    
    // 2. FRENAR ANIMACIONES ANTERIORES
    // Si había cartas cayendo de una mano anterior (o de la meada), las cancelamos
    timeoutsAnimacion.forEach(t => clearTimeout(t));
    timeoutsAnimacion = [];
    
    zona.innerHTML = ''; // Limpiamos la mesa visualmente
    
    mesa.forEach((carta, index) => {
        // Guardamos el ID del timeout para poder cancelarlo si llega otra orden rápida
        const t = setTimeout(() => {
            const div = crearCartaVisual(carta);
            div.style.opacity = 0;
            div.style.transform = "translateY(-50px) scale(0.5)";
            zona.appendChild(div);
            div.onclick = () => toggleMesa(index);
            
            setTimeout(() => {
                div.style.transition = "all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
                div.style.opacity = 1;
                div.style.transform = "translateY(0) scale(1)";
            }, 50);

        }, index * 200); // He bajado a 200ms para que sea más ágil
        
        timeoutsAnimacion.push(t);
    });
}

function renderizarMesa() {
    const zona = document.getElementById('zona-mesa');
    zona.innerHTML = '';
    
    mesa.forEach((carta, index) => {
        const div = crearCartaVisual(carta);
        
        // Si está seleccionada, le ponemos la clase
        if(indicesMesaSeleccionados.includes(index)) {
            div.classList.add('seleccionada');
        }
        
        div.onclick = () => toggleMesa(index);
        zona.appendChild(div);
    });
}

function renderizarMiMano() {
    const zona = document.getElementById('mis-cartas');
    zona.innerHTML = '';
    
    miMano.forEach((carta, index) => {
        const div = crearCartaVisual(carta);
        
        if(index === indiceCartaManoSeleccionada) {
            div.classList.add('seleccionada');
        }
        
        div.onclick = () => { 
            indiceCartaManoSeleccionada = index; 
            renderizarMiMano(); 
        };
        zona.appendChild(div);
    });
}

function crearCartaVisual(carta) {
    const div = document.createElement('div');
    const claseColor = CLASES_PALO[carta.palo] || '';
    
    div.className = `carta ${claseColor}`;
    div.innerHTML = `
        <div class="carta-num">${carta.numero}</div>
        <div class="carta-icono">${ICONOS[carta.palo] || carta.palo[0]}</div>
        <div class="carta-num inv">${carta.numero}</div>
    `;
    return div;
}

function actualizarRivales(nombres, turnoActual, cartasGanadas) {
    // Calculamos posiciones relativas
    const idDer = (miId + 1) % 4;
    const idCom = (miId + 2) % 4;
    const idIzq = (miId + 3) % 4;

    actualizarAvatar('rival-right', nombres[idDer], idDer === turnoActual, cartasGanadas[idDer]);
    actualizarAvatar('rival-top', nombres[idCom], idCom === turnoActual, cartasGanadas[idCom]);
    actualizarAvatar('rival-left', nombres[idIzq], idIzq === turnoActual, cartasGanadas[idIzq]);
}

function actualizarAvatar(elementId, nombre, esSuTurno, numCartas) {
    const el = document.getElementById(elementId);
    el.innerHTML = `
        <div>${nombre}</div>
        <div style="font-size:12px; margin-top:2px;">🎴 ${numCartas}</div>
    `;
    
    if(esSuTurno) el.classList.add('turno');
    else el.classList.remove('turno');
}


// --- 4. ACCIONES DEL JUGADOR ---

function toggleMesa(index) {
    const pos = indicesMesaSeleccionados.indexOf(index);
    if(pos === -1) {
        indicesMesaSeleccionados.push(index);
    } else {
        indicesMesaSeleccionados.splice(pos, 1);
    }
    renderizarMesa();
}

function enviarJugada() {
    if(indiceCartaManoSeleccionada === null) {
        alert("Primero selecciona una carta de tu mano.");
        return;
    }
    
    socket.emit('jugar_carta', { 
        indiceMano: indiceCartaManoSeleccionada, 
        indicesMesa: indicesMesaSeleccionados 
    });
    
    // Reseteamos selección local
    indiceCartaManoSeleccionada = null; 
    indicesMesaSeleccionados = [];
}

function robarFallo() {
    if(indicesMesaSeleccionados.length === 0) {
        alert("Selecciona las cartas de la mesa que quieras robar.");
        return;
    }
    
    socket.emit('robar_fallo', { 
        indicesMesa: indicesMesaSeleccionados 
    });
    
    indicesMesaSeleccionados = [];
}

// --- 5. SISTEMA DE EFECTOS VISUALES ---

socket.on('efecto_visual', (nombreEvento) => {
    lanzarAnimacion(nombreEvento);
});

socket.on('efecto_visual', (texto) => {
    console.log("CLIENTE: Recibido efecto ->", texto); // Mira la consola del navegador (F12)
    lanzarAnimacion(texto);
});

function lanzarAnimacion(texto) {
    const capa = document.getElementById('capa-efectos');
    if (!capa) return; // Seguridad

    const elemento = document.createElement('div');
    elemento.innerText = texto;
    elemento.className = 'texto-efecto';

    // Añadir clase específica para color/animación
    if (texto.includes("LIMPIA")) {
        elemento.classList.add('anim-limpia');
    } else {
        elemento.classList.add('anim-bac');
    }

    capa.appendChild(elemento);

    // Eliminar tras 2 segundos
    setTimeout(() => {
        elemento.remove();
    }, 2000);
}