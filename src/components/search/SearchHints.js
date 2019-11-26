import React from 'react';

export default function SearchHints ({ searchUpdate }) {
    
    return (
        <div>
            <div>Try searching for...</div>
            <hr/>
            <div>
                <div>
                    <div><span aria-label="book" role="img">📖</span> Bible References</div>
                </div>
                <div onClick={() => {searchUpdate('Prov 25:2')}} >Prov 25:2</div>
                <div onClick={() => {searchUpdate('Acts 13')}} >Acts 13</div>
                <div onClick={() => {searchUpdate('John 3:16')}} >John 3:16</div>
            </div>
            <hr/>
            <div>
                <div>❞ Words or phrases</div>
                <div onClick={() => {searchUpdate('in the beginning')}} >in the beginning</div>
                <div onClick={() => {searchUpdate('search the scriptures')}} >search the scriptures</div>
            </div>
            <hr/>
            <div>
                <div><span aria-label="people" role="img">👥</span> People</div>
                <div onClick={() => {searchUpdate('Abraham')}} >Abraham</div>
                <div onClick={() => {searchUpdate('Saul')}} >Saul</div>
                <div onClick={() => {searchUpdate('Zechariah')}} >Zechariah</div>
            </div>
            <hr/>
            <div>
                <div><span aria-label="places" role="img">📍</span> Places</div>
                <div onClick={() => {searchUpdate('Bethlehem')}} >Bethlehem</div>
                <div onClick={() => {searchUpdate('Antioch')}} >Antioch</div>
            </div>
        </div>
    );
}
