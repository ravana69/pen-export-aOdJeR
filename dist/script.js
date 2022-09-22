function initGLSLCode(canvasElement, fs, rendercb) {
    var quality = 2, quality_levels = [ 0.5, 1, 2, 4, 8 ];
    var canvas, gl, buffer, currentProgram, vertexPosition, screenVertexPosition,
	parameters = { startTime: Date.now(), time: 0, mouseX: 0.5, mouseY: 0.5, screenWidth: 0, screenHeight: 0 },
	surface = { centerX: 0, centerY: 0, width: 1, height: 1, isPanning: false, isZooming: false, lastX: 0, lastY: 0 },
	frontTarget, backTarget, screenProgram, getWebGL, resizer = {}, compileOnChangeCode = true, renderCallback,
	textureIndex;

    function init() {
	canvas = canvasElement;
	renderCallback = rendercb;
	if (!document.addEventListener) {
	    document.location = 'http://get.webgl.org/';
	    return;
	}

	//
	try {
	    gl = canvas.getContext( 'experimental-webgl', { preserveDrawingBuffer: true } );
	} catch( error ) { }

	if (!gl) {
	    alert("WebGL not supported, but code will be shown.");
	} else {
	    buffer = gl.createBuffer();
	    gl.bindBuffer( gl.ARRAY_BUFFER, buffer );
	    gl.bufferData( gl.ARRAY_BUFFER, new Float32Array( [ - 1.0, - 1.0, 1.0, - 1.0, - 1.0, 1.0, 1.0, - 1.0, 1.0, 1.0, - 1.0, 1.0 ] ), gl.STATIC_DRAW );

	    // Create surface buffer (coordinates at screen corners)

	    surface.buffer = gl.createBuffer();
	}

	resizer.offsetMouseX = 0;
	resizer.offsetMouseY = 0;
	resizer.isResizing = false;
	resizer.currentWidth = 100;
	resizer.currentHeight = 100;
	resizer.minWidth = 100;
	resizer.minHeight = 100;
	resizer.maxWidth = 100;
	resizer.maxHeight = 100;
	resizer.element = document.createElement( 'div' );
	resizer.element.className = 'resizer';

	resizer.element.addEventListener( 'mousedown', function ( event ) {
	    if (event.button !== 2) {
		resizer.offsetMouseX = event.clientX - resizer.currentWidth;
		resizer.offsetMouseY = event.clientY - resizer.currentHeight;
		resizer.isResizing = true;
		event.preventDefault();
	    }
	}, false );
	
	if (gl) {

	    var surfaceMouseDown = function ( event ) {

		if (event.shiftKey) {
		    resetSurface();
		}

		if (event.button === 0) {
		    surface.isPanning = true;
		    document.body.style.cursor = 'move';
		} else {
		    surface.isZooming = true;
		    document.body.style.cursor = 'se-resize';
		}

		surface.lastX = event.clientX;
		surface.lastY = event.clientY;
		event.preventDefault();

	    };

	    var noContextMenu = function ( event ) {

		event.preventDefault();

	    };

	    canvas.addEventListener( 'mousedown', surfaceMouseDown, false );
	    canvas.addEventListener( 'contextmenu', noContextMenu, false);
	}
	
	var clientXLast, clientYLast;

	document.addEventListener( 'mousemove', function ( event ) {
	    var clientX = event.clientX;
	    var clientY = event.clientY;

	    if (clientXLast == clientX && clientYLast == clientY)
		return;

	    clientXLast = clientX;
	    clientYLast = clientY;

	    var codeElement, dx, dy;
	    
	    parameters.mouseX = clientX / window.innerWidth;
	    parameters.mouseY = 1 - clientY / window.innerHeight;
	    
	    if (resizer.isResizing) {
		resizer.currentWidth = Math.max(Math.min(clientX - resizer.offsetMouseX, resizer.maxWidth), resizer.minWidth);
		resizer.currentHeight = Math.max(Math.min(clientY - resizer.offsetMouseY, resizer.maxHeight), resizer.minWidth);
		event.preventDefault();

	    } else if (surface.isPanning) {

		dx = clientX - surface.lastX;
		dy = clientY - surface.lastY;
		surface.centerX -= dx * surface.width / window.innerWidth;
		surface.centerY += dy * surface.height / window.innerHeight;
		surface.lastX = clientX;
		surface.lastY = clientY;
		computeSurfaceCorners();
		event.preventDefault();

	    } else if (surface.isZooming) {

		dx = clientX - surface.lastX;
		dy = clientY - surface.lastY;
		surface.height *= Math.pow(0.997, dx + dy);
		surface.lastX = clientX;
		surface.lastY = clientY;
		computeSurfaceCorners();
		event.preventDefault();

	    }
	}, false );

	function settleDown ( event ) {
	    resizer.isResizing = surface.isPanning = surface.isZooming = false;
	    document.body.style.cursor = 'default';
	}

	function mouseLeave(event) {
	    settleDown(event);
	}

	document.addEventListener( 'mouseup', settleDown, false );
	document.addEventListener( 'mouseleave', mouseLeave, false );

	onWindowResize();
	window.addEventListener( 'resize', onWindowResize, false );

	compileScreenProgram();
	compile(fs);
	if (gl) { animate(); }
    }

    function computeSurfaceCorners() {
	if (gl) {

	    surface.width = surface.height * parameters.screenWidth / parameters.screenHeight;
	    
	    var halfWidth = surface.width * 0.5, halfHeight = surface.height * 0.5;
	    
	    gl.bindBuffer( gl.ARRAY_BUFFER, surface.buffer );
	    gl.bufferData( gl.ARRAY_BUFFER, new Float32Array( [
		surface.centerX - halfWidth, surface.centerY - halfHeight,
		surface.centerX + halfWidth, surface.centerY - halfHeight,
		surface.centerX - halfWidth, surface.centerY + halfHeight,
		surface.centerX + halfWidth, surface.centerY - halfHeight,
		surface.centerX + halfWidth, surface.centerY + halfHeight,
		surface.centerX - halfWidth, surface.centerY + halfHeight ] ), gl.STATIC_DRAW );

	}

    }

    function resetSurface() {
	surface.centerX = surface.centerY = 0;
	surface.height = 1;
	computeSurfaceCorners();

    }

    function compile(fragment) {
	if (!gl) {
	    if (!getWebGL) {
		getWebGL = true;
	    }
	    return;
	}

	var program = gl.createProgram();
	//var fragment = document.getElementById('flarefs').textContent;
	var vertex = document.getElementById('surfaceVertexShader').textContent;

	var vs = createShader( vertex, gl.VERTEX_SHADER );
	var fs = createShader( fragment, gl.FRAGMENT_SHADER );

	if ( vs == null || fs == null ) return null;

	gl.attachShader( program, vs );
	gl.attachShader( program, fs );

	gl.deleteShader( vs );
	gl.deleteShader( fs );

	gl.linkProgram( program );

	if ( !gl.getProgramParameter( program, gl.LINK_STATUS ) ) {
	    var error = gl.getProgramInfoLog(program);

	    console.error(error);
	    console.error('VALIDATE_STATUS: ' + gl.getProgramParameter( program, gl.VALIDATE_STATUS ), 'ERROR: ' + gl.getError());

	    return;

	}

	if (currentProgram) {
	    //gl.deleteProgram(currentProgram);
	}

	currentProgram = program;

	// Cache uniforms
	cacheUniformLocation( program, 'time' );
	cacheUniformLocation( program, 'mouse' );
	cacheUniformLocation( program, 'resolution' );
	cacheUniformLocation( program, 'backbuffer' );
	cacheUniformLocation( program, 'surfaceSize' );

	// Load program into GPU

	gl.useProgram( currentProgram );

	// Set up buffers

	surface.positionAttribute = gl.getAttribLocation(currentProgram, "surfacePosAttrib");
	gl.enableVertexAttribArray(surface.positionAttribute);

	vertexPosition = gl.getAttribLocation(currentProgram, "position");
	gl.enableVertexAttribArray( vertexPosition );

    };

    function compileScreenProgram() {
	
	if (!gl) { return; }

	var program = gl.createProgram();
	var fragment = document.getElementById( 'fragmentShader' ).textContent;
	var vertex = document.getElementById( 'vertexShader' ).textContent;

	var vs = createShader( vertex, gl.VERTEX_SHADER );
	var fs = createShader( fragment, gl.FRAGMENT_SHADER );

	gl.attachShader( program, vs );
	gl.attachShader( program, fs );

	gl.deleteShader( vs );
	gl.deleteShader( fs );

	gl.linkProgram( program );

	if ( !gl.getProgramParameter( program, gl.LINK_STATUS ) ) {

	    console.error( 'VALIDATE_STATUS: ' + gl.getProgramParameter( program, gl.VALIDATE_STATUS ), 'ERROR: ' + gl.getError() );

	    return;

	}

	screenProgram = program;

	gl.useProgram( screenProgram );

	cacheUniformLocation( program, 'resolution' );
	cacheUniformLocation( program, 'texture' );

	screenVertexPosition = gl.getAttribLocation(screenProgram, "position");
	gl.enableVertexAttribArray( screenVertexPosition );
    }

    function cacheUniformLocation( program, label ) {
	if ( program.uniformsCache === undefined ) {
	    program.uniformsCache = {};
	}

	program.uniformsCache[ label ] = gl.getUniformLocation( program, label );
    }

    //

    function createTarget( width, height ) {
	var target = {};

	target.framebuffer = gl.createFramebuffer();
	target.renderbuffer = gl.createRenderbuffer();
	target.texture = gl.createTexture();

	// set up framebuffer

	gl.bindTexture( gl.TEXTURE_2D, target.texture );
	gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null );

	gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
	gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );

	gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST );
	gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST );

	gl.bindFramebuffer( gl.FRAMEBUFFER, target.framebuffer );
	gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0 );

	// set up renderbuffer

	gl.bindRenderbuffer( gl.RENDERBUFFER, target.renderbuffer );

	gl.renderbufferStorage( gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height );
	gl.framebufferRenderbuffer( gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, target.renderbuffer );

	// clean up

	gl.bindTexture( gl.TEXTURE_2D, null );
	gl.bindRenderbuffer( gl.RENDERBUFFER, null );
	gl.bindFramebuffer( gl.FRAMEBUFFER, null);

	return target;
    }

    function createRenderTargets() {
	frontTarget = createTarget( parameters.screenWidth, parameters.screenHeight );
	backTarget = createTarget( parameters.screenWidth, parameters.screenHeight );
    }

    //

    var dummyFunction = function() {};

    function htmlEncode(str){
	return String(str)
	    .replace(/&/g, '&amp;')
	    .replace(/"/g, '&quot;')
	    .replace(/'/g, '&#39;')
	    .replace(/</g, '&lt;')
	    .replace(/>/g, '&gt;');
    }

    function createShader( src, type ) {
	var shader = gl.createShader(type);
	var line, lineNum, lineError, index = 0, indexEnd;

	gl.shaderSource(shader, src);
	gl.compileShader(shader);

	if (!gl.getShaderParameter( shader, gl.COMPILE_STATUS)) {

	    var error = gl.getShaderInfoLog( shader );
	    
	    // Remove trailing linefeed, for FireFox's benefit.
	    while ((error.length > 1) && (error.charCodeAt(error.length - 1) < 32)) {
		error = error.substring(0, error.length - 1);
	    }

	    console.error( error );

	    return null;

	}

	return shader;

    }

    function onWindowResize( event ) {
	var isMaxWidth = ((resizer.currentWidth === resizer.maxWidth) || (resizer.currentWidth === resizer.minWidth)),
	    isMaxHeight = ((resizer.currentHeight === resizer.maxHeight) || (resizer.currentHeight === resizer.minHeight));

	resizer.isResizing = false;
	resizer.maxWidth = window.innerWidth - 75;
	resizer.maxHeight = window.innerHeight - 125;
	if (isMaxWidth || (resizer.currentWidth > resizer.maxWidth)) {
	    resizer.currentWidth = resizer.maxWidth;
	}
	if (isMaxHeight || (resizer.currentHeight > resizer.maxHeight)) {
	    resizer.currentHeight = resizer.maxHeight;
	}
	if (resizer.currentWidth < resizer.minWidth) { resizer.currentWidth = resizer.minWidth; }
	if (resizer.currentHeight < resizer.minHeight) { resizer.currentHeight = resizer.minHeight; }

	canvas.width = window.innerWidth / quality;
	canvas.height = window.innerHeight / quality;

	canvas.style.width = window.innerWidth + 'px';
	canvas.style.height = window.innerHeight + 'px';

	parameters.screenWidth = canvas.width;
	parameters.screenHeight = canvas.height;

	computeSurfaceCorners();

	if (gl) {
	    gl.viewport( 0, 0, canvas.width, canvas.height );
	    createRenderTargets();
	}
    }

    //

    function animate() {
	requestAnimationFrame( animate );
	render();
    }

    function render() {
	if (!currentProgram) return;

	parameters.time = Date.now() - parameters.startTime;

	// Set uniforms for custom shader

	gl.useProgram( currentProgram );

	gl.uniform1f( currentProgram.uniformsCache[ 'time' ], parameters.time / 1000 );
	gl.uniform2f( currentProgram.uniformsCache[ 'mouse' ], parameters.mouseX, parameters.mouseY );
	gl.uniform2f( currentProgram.uniformsCache[ 'resolution' ], parameters.screenWidth, parameters.screenHeight );
	gl.uniform1i( currentProgram.uniformsCache[ 'backbuffer' ], 0 );
	gl.uniform2f( currentProgram.uniformsCache[ 'surfaceSize' ], surface.width, surface.height );

	if (renderCallback) {
	    renderCallback(gl);
	}

	gl.bindBuffer( gl.ARRAY_BUFFER, surface.buffer );
	gl.vertexAttribPointer( surface.positionAttribute, 2, gl.FLOAT, false, 0, 0 );
	
	gl.bindBuffer( gl.ARRAY_BUFFER, buffer );
	gl.vertexAttribPointer( vertexPosition, 2, gl.FLOAT, false, 0, 0 );

	gl.activeTexture( gl.TEXTURE0);
	gl.bindTexture( gl.TEXTURE_2D, backTarget.texture );

	// Render custom shader to front buffer

	gl.bindFramebuffer( gl.FRAMEBUFFER, frontTarget.framebuffer );

	gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
	gl.drawArrays( gl.TRIANGLES, 0, 6 );

	// Set uniforms for screen shader

	gl.useProgram( screenProgram );

	gl.uniform2f( screenProgram.uniformsCache[ 'resolution' ], parameters.screenWidth, parameters.screenHeight );
	gl.uniform1i( screenProgram.uniformsCache[ 'texture' ], 1 );

	gl.bindBuffer( gl.ARRAY_BUFFER, buffer );
	gl.vertexAttribPointer( screenVertexPosition, 2, gl.FLOAT, false, 0, 0 );
	
	gl.activeTexture( gl.TEXTURE1 );
	gl.bindTexture( gl.TEXTURE_2D, frontTarget.texture );

	// Render front buffer to screen

	gl.bindFramebuffer( gl.FRAMEBUFFER, null );

	gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
	gl.drawArrays( gl.TRIANGLES, 0, 6 );

	// Swap buffers

	var tmp = frontTarget;
	frontTarget = backTarget;
	backTarget = tmp;
    }

    init();

    return {
	program : currentProgram,
	gl : gl
    };
}