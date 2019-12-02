import React from 'react';
import { Link } from 'gatsby';

import { makeStyles } from '@material-ui/core/styles';
import { MenuBook, FormatQuote, PeopleAlt, Place, KeyboardArrowRight } from '@material-ui/icons';
import { List, ListSubheader, ListItem, ListItemIcon, ListItemText, Divider, Button, Container } from '@material-ui/core';

export default function SearchHints ({ searchUpdate }) {
    const classes = useStyles();
    return (
        <List subheader={<ListSubheader>Try searching for...</ListSubheader>}>
            <ListItem alignItems="flex-start">
                <ListItemIcon className={classes.icon} >
                    {/* <MenuBook />  */}
                    <span role="img" aria-label="book">📖</span>
                </ListItemIcon>
                <ListItemText 
                    primary="Bible References" 
                    secondary={<>
                        Examples:&nbsp;
                        <Link to={'#prov_25_2'} onClick={() => {searchUpdate('Prov 25:2')}}>Prov&nbsp;25:2</Link>{', '}
                        <Link to={'#acts_13'} onClick={() => {searchUpdate('Acts 13')}}>Acts&nbsp;13</Link>{', '}
                        <Link to={'#john_3_16'} onClick={() => {searchUpdate('John 3:16')}}>John&nbsp;3:16</Link>
                    </>}
                />
                <Button component={Link} to="/passages" disableRipple>Browse<KeyboardArrowRight /></Button>
            </ListItem>

            <Divider variant="middle"/>

            <ListItem alignItems="flex-start">
                <ListItemIcon className={classes.icon}>
                    <FormatQuote/>
                </ListItemIcon>
                <ListItemText 
                    primary="Words or phrases" 
                    secondary={<>
                        Examples:&nbsp;
                        <Link to={'#in_the_beginning'} onClick={() => {searchUpdate('in the beginning')}}>"in the beginning"</Link>{', '}
                        <Link to={'#search_the_scriptures'} onClick={() => {searchUpdate('search the scriptures')}}>"search the scriptures"</Link>
                    </>}
                />
            </ListItem>

            <Divider variant="middle"/>

            <ListItem alignItems="flex-start">
                <ListItemIcon className={classes.icon}>
                    {/* <PeopleAlt/>  */}
                    <span role="img" aria-label="people">👥</span>
                </ListItemIcon>
                <ListItemText 
                    primary="People" 
                    secondary={<>
                        Examples:&nbsp;
                        <Link to={'#abraham'} onClick={() => {searchUpdate('Abraham')}}>Abraham</Link>{', '}
                        <Link to={'#saul'} onClick={() => {searchUpdate('Saul')}}>Saul</Link>{', '}
                        <Link to={'#saul'} onClick={() => {searchUpdate('Saul')}}>Saul</Link>
                    </>}
                />
                <Button component={Link} to="/people" disableRipple>Browse<KeyboardArrowRight /></Button>
            </ListItem>

            <Divider variant="middle"/>

            <ListItem alignItems="flex-start">
                <ListItemIcon className={classes.icon}>
                    {/* <Place/>  */}
                    <span role="img" aria-label="places">📍</span>
                </ListItemIcon>
                <ListItemText 
                    primary="Places"
                    secondary={<>
                        Examples:&nbsp;
                        <Link to={'#bethlehem'} onClick={() => {searchUpdate('Bethlehem')}}>Bethlehem</Link>,&nbsp;
                        <Link to={'#antioch'} onClick={() => {searchUpdate('Antioch')}}>Antioch</Link>
                    </>}
                />
                <Button component={Link} to="/places" disableRipple>Browse<KeyboardArrowRight /></Button>
            </ListItem>
        </List>
    );
}

const useStyles = makeStyles(theme => ({
    root: {
        marginTop:15,
        marginBottom:15,
    },
    padding:{
        paddingTop:0,
        paddingBottom:0,
    },
    icon: {
        color:"#000",
    }
  }));